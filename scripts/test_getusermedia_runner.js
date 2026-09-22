const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 } // minimal thumbnail since getUserMedia does the stream capture
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  });

  ipcMain.on('capture-result', (_event, result) => {
    console.log('[USER_MEDIA_TEST] Result:', JSON.stringify(result, null, 2));
    if (result.success) {
      console.log(`[USER_MEDIA_TEST] SUCCESS: Real desktop stream frame captured! ${result.width}x${result.height}px (${Math.round(result.dataUrlLength / 1024)} KB)`);
      process.exit(0);
    } else {
      console.error('[USER_MEDIA_TEST] FAILED:', result.error);
      process.exit(1);
    }
  });

  win.loadFile(path.join(__dirname, 'test_getusermedia.html'));
});
