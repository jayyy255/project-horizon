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
import { loadGeminiKey, getGeminiStatus, saveGeminiKey } from './settings';
import { HotkeyManager } from './hotkeys';

const ownsSingleInstance = app.requestSingleInstanceLock();
if (!ownsSingleInstance) app.quit();

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
const envCandidates = app.isPackaged ? [] : [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
];
for (const p of envCandidates) {
  loadEnvFile(p);
}
if (process.env.GEMINI_API_KEY) {
  console.log('[Project Horizon] Gemini API Key loaded successfully from .env');
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let barWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agentHost: AgentHost | null = null;
let isOverlayVisible = false;
let isBarVisible = false;
let captureTarget: 'floating' | 'workspace' = 'workspace';
let hotkeyManager: HotkeyManager;
let isQuitting = false;
let perceptionWorker: ReturnType<typeof spawn> | null = null;

app.on('before-quit', () => { isQuitting = true; perceptionWorker?.kill(); });
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
});

function syncDismissShortcut(): void {
  if (isOverlayVisible || isBarVisible) {
    if (!globalShortcut.isRegistered('Escape')) globalShortcut.register('Escape', () => {
      hideOverlay();
      hideFloatingBar();
    });
  } else if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
}

let lastCapturedData: {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
} | null = null;



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
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1160, Math.round(width * 0.85)),
    height: Math.min(840, Math.round(height * 0.85)),
    minWidth: 840,
    minHeight: 600,
    center: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#8CC1E9',
      height: 54
    },
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

  mainWindow.setMenuBarVisibility(false);
  loadWindowContent(mainWindow);

  if (agentHost) {
    agentHost.setMainWindow(mainWindow);
  }

  mainWindow.on('close', event => {
    if (!isQuitting) { event.preventDefault(); mainWindow?.hide(); }
  });
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

    // 3. Send capture data to overlay window to render full screen lasso canvas
    overlayWindow?.webContents.send('horizon:desktop-captured', captureData);

    // 4. Show and focus overlay window
    isOverlayVisible = true;
    overlayWindow?.show();
    overlayWindow?.focus();
    syncDismissShortcut();

    const tReady = performance.now();
    console.log(`[Project Horizon] Real desktop capture -> overlay ready in ${(tReady - t0).toFixed(2)} ms`);
  } catch (err) {
    console.error('[Project Horizon] Failed to capture real desktop:', err);
  }
}

function hideOverlay(): void {
  const t0 = performance.now();
  isOverlayVisible = false;
  overlayWindow?.hide();
  syncDismissShortcut();
  const t1 = performance.now();
  console.log(`[Project Horizon] Overlay dismissed in ${(t1 - t0).toFixed(2)} ms`);
}

function toggleOverlay(): void {
  if (isOverlayVisible) {
    hideOverlay();
  } else {
    captureTarget = mainWindow?.isVisible() ? 'workspace' : 'floating';
    if (captureTarget === 'floating') createBarWindow();
    hideFloatingBar();
    triggerRealCaptureAndShowOverlay();
  }
}

function createBarWindow(): BrowserWindow {
  if (barWindow && !barWindow.isDestroyed()) {
    return barWindow;
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = primaryDisplay.workArea;

  const barWidth = 760;
  const barHeight = 176;
  const x = screenX + Math.round((screenWidth - barWidth) / 2);
  const y = screenY + screenHeight - barHeight - 20; // 20px docked above Windows taskbar

  barWindow = new BrowserWindow({
    title: 'Project Horizon — Floating Assistant',
    x,
    y,
    width: barWidth,
    height: barHeight,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    show: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  barWindow.on('page-title-updated', event => event.preventDefault());
  loadWindowContent(barWindow, 'bar');

  barWindow.on('closed', () => {
    barWindow = null;
    isBarVisible = false;
  });

  return barWindow;
}

function showFloatingBar(): void {
  if (!barWindow || barWindow.isDestroyed()) {
    createBarWindow();
  }
  barWindow?.show();
  barWindow?.focus();
  isBarVisible = true;
  syncDismissShortcut();
}

function hideFloatingBar(): void {
  if (barWindow && !barWindow.isDestroyed()) {
    barWindow.hide();
  }
  isBarVisible = false;
  syncDismissShortcut();
}

function toggleFloatingBar(): void {
  if (isBarVisible && barWindow && barWindow.isVisible()) {
    hideFloatingBar();
  } else {
    showFloatingBar();
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

  const brandIcon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png'));
  tray = new Tray(brandIcon.isEmpty() ? iconCanvas : brandIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Project Horizon — Windows Desktop Agent');

  refreshTrayMenu();
  tray.on('click', () => { toggleFloatingBar(); });
}

function refreshTrayMenu(): void {
  const shortcut = hotkeyManager?.getStatus();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Summon Floating Bar${shortcut?.active ? ` (${shortcut.label})` : ''}`,
      click: () => toggleFloatingBar(),
    },
    {
      label: 'Show Full Window',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Screen Capture (Lasso)',
      click: () => toggleOverlay(),
    },
    { type: 'separator' },
    {
      label: 'Preferences...',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
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

  tray?.setContextMenu(contextMenu);
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
        path.resolve(process.resourcesPath || '', 'perception-service/runtime/pythonw.exe'),
        path.resolve(process.resourcesPath || '', 'perception-service/runtime/python.exe'),
        path.resolve(process.resourcesPath || '', 'perception-service/.venv/Scripts/pythonw.exe'),
        path.resolve(process.resourcesPath || '', 'perception-service/.venv/Scripts/python.exe'),
        path.resolve(process.cwd(), 'backend/perception-service/.venv/Scripts/pythonw.exe'),
        path.resolve(process.cwd(), 'backend/perception-service/.venv/Scripts/python.exe'),
        path.resolve(__dirname, '../../backend/perception-service/.venv/Scripts/pythonw.exe'),
        path.resolve(__dirname, '../../backend/perception-service/.venv/Scripts/python.exe'),
        path.resolve(app.getAppPath(), 'backend/perception-service/.venv/Scripts/pythonw.exe'),
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
          detached: false,
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, PYTHONHOME: '', PYTHONPATH: '', PYTHONDONTWRITEBYTECODE: '1' },
        });
        perceptionWorker = child;
        child.on('error', error => console.warn('[Project Horizon] Perception worker could not start:', error.message));
        child.unref();
      }
    });
}

app.whenReady().then(async () => {
  if (!ownsSingleInstance) return;
  loadGeminiKey();
  ipcMain.handle('horizon:get-gemini-status', () => getGeminiStatus());
  ipcMain.handle('horizon:save-gemini-key', (_event, key: string) => saveGeminiKey(key));
  const isVerifyMode = process.argv.includes('--verify-packaged') || process.env.VERIFY_PACKAGED === '1';
  if (isVerifyMode) {
    await runPackagedVerification();
    return;
  }

  spawnPerceptionServiceIfNeeded();
  agentHost = new AgentHost();
  hotkeyManager = new HotkeyManager(path.join(app.getPath('userData'), 'hotkey-settings.json'), globalShortcut, toggleFloatingBar);
  hotkeyManager.restore();
  createMainWindow();
  createOverlayWindow();
  setupSystemTray();

  if (mainWindow) {
    agentHost.setMainWindow(mainWindow);
  }

  // Setup IPC Handlers
  ipcMain.handle('horizon:get-hotkey-status', () => hotkeyManager.getStatus());
  ipcMain.handle('horizon:approve-hotkey', (_event, customHotkey?: string) => {
    const result = hotkeyManager.approve(customHotkey);
    refreshTrayMenu();
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('horizon:hotkey-status', hotkeyManager.getStatus());
    return result;
  });

  ipcMain.handle('horizon:open-main-window', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    }
    mainWindow?.show();
    mainWindow?.focus();
    hideFloatingBar();
    return true;
  });

  ipcMain.handle('horizon:hide-floating-bar', () => {
    hideFloatingBar();
    return false;
  });

  ipcMain.handle('horizon:resize-floating-bar', (event, requestedHeight: number) => {
    if (!barWindow || event.sender !== barWindow.webContents || !Number.isFinite(requestedHeight)) return;
    const area = screen.getDisplayMatching(barWindow.getBounds()).workArea;
    const height = Math.round(Math.max(176, Math.min(requestedHeight, 560, area.height - 40)));
    const bounds = barWindow.getBounds();
    barWindow.setBounds({ ...bounds, height, y: area.y + area.height - height - 20 });
  });

  ipcMain.handle('horizon:toggle-floating-bar', () => {
    toggleFloatingBar();
    return isBarVisible;
  });

  ipcMain.handle('horizon:trigger-capture', async (event) => {
    captureTarget = event.sender === barWindow?.webContents ? 'floating' : 'workspace';
    hideFloatingBar();
    await triggerRealCaptureAndShowOverlay();
    return true;
  });

  ipcMain.handle('horizon:capture-desktop', async (_event, targetWindowName?: string) => {
    return await captureRealDesktop(targetWindowName);
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
    if (captureTarget === 'floating') showFloatingBar();
    return false;
  });

  ipcMain.handle('horizon:attach-area', (_event, data) => {
    console.log('[Project Horizon] Area attached from overlay:', data?.type, data?.coords);
    const target = captureTarget === 'floating' ? barWindow : mainWindow;
    target?.webContents.send('horizon:area-attached', data);
    hideOverlay();
    if (captureTarget === 'floating') {
      showFloatingBar();
    } else if (mainWindow && mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      showFloatingBar();
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
