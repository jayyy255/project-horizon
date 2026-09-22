const { app, BrowserWindow, desktopCapturer, screen } = require('electron');

// Disable sandbox or GPU process flags if running from CLI environment
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

app.whenReady().then(async () => {
  try {
    // Creating a window ensures the Windows message loop and desktop thread are active
    const win = new BrowserWindow({
      width: 400,
      height: 300,
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    win.loadURL('about:blank');

    // Wait a brief tick for the window to attach to the desktop
    await new Promise(resolve => setTimeout(resolve, 500));

    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor || 1;
    const width = Math.round(primaryDisplay.bounds.width * scaleFactor);
    const height = Math.round(primaryDisplay.bounds.height * scaleFactor);

    console.log(`[VERIFY_CAPTURE] Primary Display: ${primaryDisplay.id} | Scaled: ${width}x${height} | ScaleFactor: ${scaleFactor}`);

    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });

    console.log(`[VERIFY_CAPTURE] Found ${sources.length} sources:`);
    for (const s of sources) {
      const sz = s.thumbnail.getSize();
      console.log(` - Source: "${s.name}" (ID: ${s.id}) -> Size: ${sz.width}x${sz.height}`);
    }

    const screenSource = sources.find(s => s.id.startsWith('screen')) || sources[0];
    const dataUrl = screenSource.thumbnail.toDataURL();
    const size = screenSource.thumbnail.getSize();

    console.log(`[VERIFY_CAPTURE] Selected: "${screenSource.name}" -> Size: ${size.width}x${size.height}px | Payload: ${Math.round(dataUrl.length / 1024)} KB`);

    win.destroy();

    if (size.width > 0 && size.height > 0 && dataUrl.length > 5000) {
      console.log('[VERIFY_CAPTURE] SUCCESS: Real desktop screenshot captured successfully!');
      process.exit(0);
    } else {
      console.error('[VERIFY_CAPTURE] FAILED: Size was 0x0');
      process.exit(1);
    }
  } catch (err) {
    console.error('[VERIFY_CAPTURE] ERROR:', err);
    process.exit(1);
  }
});
