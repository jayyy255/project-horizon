import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let isOverlayVisible = false;

function createMainWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 620,
    height: 720,
    x: width - 640,
    y: 40,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    title: 'Project Horizon — Multimodal Desktop Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/#capture');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'), {
      hash: 'capture',
    });
  }

  return overlayWindow;
}

function toggleOverlay(): void {
  if (!overlayWindow) {
    createOverlayWindow();
  }

  isOverlayVisible = !isOverlayVisible;
  if (isOverlayVisible) {
    overlayWindow?.show();
    overlayWindow?.focus();
  } else {
    overlayWindow?.hide();
  }

  mainWindow?.webContents.send('horizon:overlay-toggled', isOverlayVisible);
}

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();

  // Register Global Hotkey Win+Shift+C (or Alt+Shift+C) per §3.1
  const hotkey = 'CommandOrControl+Shift+C';
  const registered = globalShortcut.register(hotkey, () => {
    console.log(`[Project Horizon] Global Hotkey (${hotkey}) triggered`);
    toggleOverlay();
  });

  if (!registered) {
    console.warn(`[Project Horizon] Failed to register global shortcut ${hotkey}`);
  }

  // Register Escape dismiss handler
  globalShortcut.register('Escape', () => {
    if (isOverlayVisible) {
      toggleOverlay();
    }
  });

  // Setup IPC handlers
  ipcMain.handle('horizon:toggle-overlay', () => {
    toggleOverlay();
    return isOverlayVisible;
  });

  ipcMain.handle('horizon:close-overlay', () => {
    if (isOverlayVisible) {
      toggleOverlay();
    }
    return false;
  });

  ipcMain.handle('horizon:get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
    };
  });

  ipcMain.handle('horizon:trigger-tier2', (_event, payload) => {
    mainWindow?.webContents.send('horizon:tier2-requested', payload);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
