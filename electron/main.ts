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
import dotenv from 'dotenv';
import { AgentHost } from './agent';

// Load .env from root workspace or packaged app path with override: true
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
}
if (!process.env.GEMINI_API_KEY) {
  try {
    dotenv.config({ path: path.resolve(app.getAppPath(), '.env'), override: true });
  } catch {
    // ignore if app is not ready yet
  }
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


/**
 * Captures real desktop pixels using Electron's desktopCapturer API.
 * Pulls native resolution buffer directly from Windows DWM.
 */
async function captureRealDesktop(): Promise<{
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

  console.log(`[Project Horizon] Enumerating desktop display: ${primaryDisplay.id} (${width}x${height}px, scale: ${scaleFactor})`);

  let dataUrl = '';
  let sourceId = '';
  let displayLabel = 'Entire Screen';

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });

    if (sources && sources.length > 0) {
      const source = sources[0];
      sourceId = source.id;
      displayLabel = source.name || 'Entire Screen';
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
  let totalWidth = 0;
  let maxHeight = 0;

  for (const d of displays) {
    totalWidth += d.bounds.width;
    if (d.bounds.height > maxHeight) maxHeight = d.bounds.height;
  }

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: totalWidth,
    height: maxHeight,
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
    },
  });

  loadWindowContent(overlayWindow, 'capture');

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

async function triggerRealCaptureAndShowOverlay(): Promise<void> {
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

    mainWindow?.webContents.send('horizon:overlay-toggled', true);
  } catch (err) {
    console.error('[Project Horizon] Failed to capture real desktop:', err);
  }
}

function hideOverlay(): void {
  isOverlayVisible = false;
  overlayWindow?.hide();
  mainWindow?.webContents.send('horizon:overlay-toggled', false);
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

app.whenReady().then(() => {
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
  ipcMain.handle('horizon:capture-desktop', async () => {
    return await captureRealDesktop();
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
