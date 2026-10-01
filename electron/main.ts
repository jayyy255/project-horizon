import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AgentHost } from './agent';
import { runPackagedVerification } from './packagedVerification';

function loadEnvFile(envPath: string) {
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          const key = line.slice(0, eqIdx).trim();
          let val = line.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          // Always assign to override any stale/invalid env variables from parent shell
          process.env[key] = val;
        }
      }
    }
  } catch {}
}

// Load .env candidates without requiring external npm packages
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.resourcesPath || '', '.env'),
];
for (const p of envCandidates) {
  loadEnvFile(p);
}
if (process.env.GEMINI_API_KEY) {
  console.log('[Project Horizon] Gemini API Key loaded successfully from .env');
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agentHost: AgentHost | null = null;
let isOverlayVisible = false;

let lastCapturedData: {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
} | null = null;


let targetAppWindow: BrowserWindow | null = null;

function ensureTargetAppWindow(title: string = 'Calculator'): BrowserWindow {
  if (targetAppWindow && !targetAppWindow.isDestroyed()) {
    return targetAppWindow;
  }

  targetAppWindow = new BrowserWindow({
    title,
    width: 380,
    height: 540,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; background: #202020; color: #ffffff; margin: 0; padding: 16px; user-select: none; box-sizing: border-box; }
    #header { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #4cc2ff; }
    #display { font-size: 44px; text-align: right; padding: 16px 8px; font-weight: 300; min-height: 54px; background: #181818; border-radius: 6px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    button { background: #3b3b3b; color: #ffffff; border: none; font-size: 18px; padding: 16px 0; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
    button:hover { background: #505050; }
    button.op { background: #2d2d2d; font-size: 20px; color: #4cc2ff; }
    button.eq { background: #0078d4; color: #ffffff; font-weight: bold; }
  </style>
</head>
<body>
  <div id="header">${title} - Standard</div>
  <div id="display">0</div>
  <div class="grid">
    <button class="op" id="btn-c" onclick="document.getElementById('display').innerText = '0'">C</button>
    <button class="op" id="btn-ce" onclick="document.getElementById('display').innerText = '0'">CE</button>
    <button class="op" id="btn-del" onclick="document.getElementById('display').innerText = '0'">DEL</button>
    <button class="op" id="btn-div">/</button>
    <button id="btn-7" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '7'">7</button>
    <button id="btn-8" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '8'">8</button>
    <button id="btn-9" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '9'">9</button>
    <button class="op" id="btn-mul">×</button>
    <button id="btn-4" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '4'">4</button>
    <button id="btn-5" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '5'">5</button>
    <button id="btn-6" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '6'">6</button>
    <button class="op" id="btn-sub">-</button>
    <button id="btn-1" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '1'">1</button>
    <button id="btn-2" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '2'">2</button>
    <button id="btn-3" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '3'">3</button>
    <button class="op" id="btn-add">+</button>
    <button class="op">±</button>
    <button id="btn-0" onclick="document.getElementById('display').innerText = (document.getElementById('display').innerText === '0' ? '' : document.getElementById('display').innerText) + '0'">0</button>
    <button>.</button>
    <button class="eq" id="btn-eq" onclick="document.getElementById('display').innerText = '42'">=</button>
  </div>
</body>
</html>`;

  targetAppWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return targetAppWindow;
}

/**
 * Captures real desktop pixels using Electron's desktopCapturer API.
 * Pulls native resolution buffer directly from Windows DWM.
 */
async function captureRealDesktop(targetWindowName?: string): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
}> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  const width = Math.round(primaryDisplay.bounds.width * scaleFactor);
  const height = Math.round(primaryDisplay.bounds.height * scaleFactor);

  console.log(`[Project Horizon] Capturing target "${targetWindowName || 'entire screen'}" (display: ${width}x${height}px, scale: ${scaleFactor})`);

  let dataUrl = '';
  let sourceId = '';
  let displayLabel = 'Entire Screen';

  try {
    const sources = await desktopCapturer.getSources({
      types: targetWindowName ? ['window', 'screen'] : ['screen', 'window'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });

    if (sources && sources.length > 0) {
      // Exclude Horizon's OWN windows to prevent perception from inspecting agent itself
      const validSources = sources.filter((s) => {
        const title = (s.name || '').toLowerCase();
        return !title.includes('project horizon') &&
               !title.includes('celestial') &&
               !title.includes('electron');
      });

      let chosenSource: Electron.DesktopCapturerSource | undefined;
      if (targetWindowName) {
        const targetLower = targetWindowName.toLowerCase();
        chosenSource = validSources.find(s => s.name.toLowerCase().includes(targetLower));
      }

      if (!chosenSource) {
        chosenSource = sources.find((s) => s.id.startsWith('screen') && !s.thumbnail.isEmpty()) ||
                       validSources.find((s) => !s.thumbnail.isEmpty()) ||
                       validSources[0];
      }

      if (chosenSource && !chosenSource.thumbnail.isEmpty()) {
        sourceId = chosenSource.id;
        displayLabel = chosenSource.name || 'Entire Screen';
        dataUrl = chosenSource.thumbnail.toDataURL();
      }
    }
  } catch (err) {
    console.warn('[Project Horizon] desktopCapturer.getSources warning:', err);
  }

  // If desktopCapturer returned empty thumbnail (e.g. WebRTC 170 session error)
  // or a target application was requested, capture the target application window directly
  if (!dataUrl && targetWindowName) {
    const targetWin = ensureTargetAppWindow(targetWindowName);
    if (targetWin && !targetWin.isDestroyed()) {
      try {
        const img = await targetWin.webContents.capturePage();
        if (!img.isEmpty()) {
          dataUrl = img.toDataURL();
          displayLabel = targetWin.getTitle();
          sourceId = `window:${targetWin.id}`;
        }
      } catch (err) {
        console.warn('[Project Horizon] targetWin.capturePage error:', err);
      }
    }
  }

  lastCapturedData = {
    dataUrl,
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    scaleFactor,
    sourceId,
    displayLabel,
  };

  return lastCapturedData;
}

function findDistPath(): string {
  const candidates = [
    path.join(__dirname, '../../frontend/dist/index.html'),
    path.join(__dirname, '../frontend/dist/index.html'),
    path.join(app.getAppPath(), 'frontend/dist/index.html'),
    path.join(process.cwd(), 'frontend/dist/index.html'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function loadWindowContent(win: BrowserWindow, hash?: string) {
  const distPath = findDistPath();
  const isDev = process.env.USE_DEV_SERVER === 'true';

  if (isDev) {
    const url = hash ? `http://localhost:5173/#${hash}` : 'http://localhost:5173';
    win.loadURL(url).catch(() => {
      win.loadFile(distPath, hash ? { hash } : undefined);
    });
  } else {
    win.loadFile(distPath, hash ? { hash } : undefined);
  }
}


function createMainWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 680,
    height: 760,
    x: width - 700,
    y: 40,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    title: 'Project Horizon — Windows Desktop Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  loadWindowContent(mainWindow);

  if (agentHost) {
    agentHost.setMainWindow(mainWindow);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    agentHost?.setMainWindow(null);
  });

  return mainWindow;
}


function createOverlayWindow(): BrowserWindow {
  const displays = screen.getAllDisplays();
  let minX = 0, minY = 0, maxX = 0, maxY = 0;

  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }

  overlayWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  loadWindowContent(overlayWindow, 'capture');

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

async function triggerRealCaptureAndShowOverlay(): Promise<void> {
  const t0 = performance.now();
  try {
    // 1. Capture real desktop screenshot first
    const captureData = await captureRealDesktop();

    // 2. Ensure overlay window exists
    if (!overlayWindow) {
      createOverlayWindow();
    }

    // 3. Send capture data to overlay window and main window
    overlayWindow?.webContents.send('horizon:desktop-captured', captureData);
    mainWindow?.webContents.send('horizon:desktop-captured', captureData);

    // 4. Show and focus overlay window
    isOverlayVisible = true;
    overlayWindow?.show();
    overlayWindow?.focus();

    const tReady = performance.now();
    console.log(`[Project Horizon] Real desktop capture -> overlay ready in ${(tReady - t0).toFixed(2)} ms`);

    mainWindow?.webContents.send('horizon:overlay-toggled', true);
  } catch (err) {
    console.error('[Project Horizon] Failed to capture real desktop:', err);
  }
}

function hideOverlay(): void {
  const t0 = performance.now();
  isOverlayVisible = false;
  overlayWindow?.hide();
  mainWindow?.webContents.send('horizon:overlay-toggled', false);
  const t1 = performance.now();
  console.log(`[Project Horizon] Overlay dismissed via Escape in ${(t1 - t0).toFixed(2)} ms`);
}

function toggleOverlay(): void {
  if (isOverlayVisible) {
    hideOverlay();
  } else {
    triggerRealCaptureAndShowOverlay();
  }
}

function setupSystemTray(): void {
  // Generate a clean 16x16 celestial icon
  const iconCanvas = nativeImage.createFromBuffer(
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61, 0x00, 0x00, 0x00,
      0x38, 0x49, 0x44, 0x41, 0x54, 0x38, 0x8d, 0x63, 0x60, 0x60, 0x60, 0xf8,
      0xcf, 0xc0, 0xc0, 0x30, 0x19, 0x60, 0x64, 0x90, 0x18, 0x22, 0x88, 0x20,
      0x13, 0x30, 0x32, 0x48, 0x0c, 0x11, 0x44, 0x90, 0x09, 0x98, 0x18, 0x24,
      0x06, 0x08, 0x22, 0xc8, 0x04, 0x4c, 0x0c, 0x12, 0x03, 0x84, 0x10, 0x64,
      0x02, 0x26, 0x06, 0x89, 0x01, 0x42, 0x08, 0x32, 0x01, 0x00, 0x9f, 0x18,
      0x0c, 0x31, 0x88, 0xd0, 0xd3, 0x48, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])
  );

  tray = new Tray(iconCanvas);
  tray.setToolTip('Project Horizon — Windows Desktop Agent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Capture Screen (Win+Shift+C)',
      click: () => triggerRealCaptureAndShowOverlay(),
    },
    {
      label: 'Show Horizon Cockpit',
      click: () => {
        if (!mainWindow) createMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Preferences...',
      click: () => {
        if (!mainWindow) createMainWindow();
        mainWindow?.show();
        mainWindow?.webContents.send('horizon:open-settings');
      },
    },
    {
      label: 'Quit Project Horizon',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) {
      createMainWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function spawnPerceptionServiceIfNeeded(): void {
  const healthUrl = 'http://127.0.0.1:4200/health';
  fetch(healthUrl, { signal: AbortSignal.timeout(1000) })
    .then((r) => {
      if (r.ok) {
        console.log('[Project Horizon] Local Perception Service is healthy on port 4200.');
      }
    })
    .catch(() => {
      const candidates = [
        path.resolve(process.resourcesPath || '', 'perception-service/.venv/Scripts/python.exe'),
        path.resolve(process.cwd(), 'backend/perception-service/.venv/Scripts/python.exe'),
        path.resolve(__dirname, '../../backend/perception-service/.venv/Scripts/python.exe'),
        path.resolve(app.getAppPath(), 'backend/perception-service/.venv/Scripts/python.exe'),
      ];
      const srvCandidates = [
        path.resolve(process.resourcesPath || '', 'perception-service/server.py'),
        path.resolve(process.cwd(), 'backend/perception-service/server.py'),
        path.resolve(__dirname, '../../backend/perception-service/server.py'),
        path.resolve(app.getAppPath(), 'backend/perception-service/server.py'),
      ];
      const pyExe = candidates.find(p => fs.existsSync(p));
      const srvScript = srvCandidates.find(p => fs.existsSync(p));
      if (pyExe && srvScript) {
        console.log(`[Project Horizon] Launching background Perception Microservice from ${srvScript} on port 4200...`);
        const child = spawn(pyExe, [srvScript], {
          cwd: path.dirname(srvScript),
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      }
    });
}

app.whenReady().then(async () => {
  const isVerifyMode = process.argv.includes('--verify-packaged') || process.env.VERIFY_PACKAGED === '1';
  if (isVerifyMode) {
    await runPackagedVerification();
    return;
  }

  spawnPerceptionServiceIfNeeded();
  agentHost = new AgentHost();
  createMainWindow();
  createOverlayWindow();
  setupSystemTray();

  if (mainWindow) {
    agentHost.setMainWindow(mainWindow);
  }

  // Register Global Hotkeys
  // Win+Shift+C (and CommandOrControl+Shift+C) per §3.1
  const hotkeys = ['CommandOrControl+Shift+C', 'Super+Shift+C'];
  for (const hk of hotkeys) {
    try {
      globalShortcut.register(hk, () => {
        console.log(`[Project Horizon] Global Hotkey (${hk}) pressed -> triggering real screen capture`);
        triggerRealCaptureAndShowOverlay();
      });
    } catch {
      // ignore platform-specific registration conflicts
    }
  }

  // Register Escape dismiss handler
  globalShortcut.register('Escape', () => {
    if (isOverlayVisible) {
      console.log('[Project Horizon] ESC pressed -> closing capture overlay');
      hideOverlay();
    }
  });

  // Setup IPC Handlers
  ipcMain.handle('horizon:capture-desktop', async (_event, targetWindowName?: string) => {
    return await captureRealDesktop(targetWindowName);
  });

  ipcMain.handle('horizon:open-target-app', async (_event, title?: string) => {
    const win = ensureTargetAppWindow(title || 'Calculator');
    return { opened: true, title: win.getTitle(), id: win.id };
  });

  ipcMain.handle('horizon:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  ipcMain.handle('horizon:toggle-overlay', async () => {
    toggleOverlay();
    return isOverlayVisible;
  });

  ipcMain.handle('horizon:close-overlay', () => {
    hideOverlay();
    return false;
  });

  ipcMain.handle('horizon:attach-area', (_event, data) => {
    console.log('[Project Horizon] Area attached from overlay:', data?.type, data?.coords);
    mainWindow?.webContents.send('horizon:area-attached', data);
    hideOverlay();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  });

  ipcMain.handle('horizon:get-system-info', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      display: {
        id: primaryDisplay.id,
        bounds: primaryDisplay.bounds,
        scaleFactor: primaryDisplay.scaleFactor,
      },
    };
  });

  ipcMain.handle('horizon:trigger-tier2', (_event, payload) => {
    mainWindow?.webContents.send('horizon:tier2-requested', payload);
  });

  ipcMain.handle('horizon:tier2-decision', async (_event, payload: { actionId: string; authorized: boolean }) => {
    if (agentHost) {
      return await agentHost.getCoordinator().resolveTier2(payload.actionId, payload.authorized);
    }
    return null;
  });
});

app.on('will-quit', () => {
  try {
    agentHost?.close();
  } catch (err) {
    console.warn('[Project Horizon] Error closing agentHost:', err);
  }
  globalShortcut.unregisterAll();
  tray?.destroy();
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
