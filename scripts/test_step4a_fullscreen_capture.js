const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  });

  ipcMain.on('report-capture-result', (_event, result) => {
    if (result.success) {
      console.log('=== [STEP 4a VERIFICATION: REAL FULL-SCREEN DESKTOP CAPTURE SUCCESS] ===');
      console.log(`Resolution: ${result.width} x ${result.height} px`);
      console.log(`Source Name: "${result.sourceName}" (ID: ${result.sourceId})`);
      console.log(`Payload Size: ${Math.round(result.dataUrlLength / 1024)} KB`);

      const base64Data = result.dataUrl.replace(/^data:image\/png;base64,/, '');
      const outDir = path.join(__dirname, '../scratch');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const outPath = path.join(outDir, 'step4a_actual_desktop_capture.png');
      fs.writeFileSync(outPath, base64Data, 'base64');
      console.log(`Saved actual desktop screenshot to: ${outPath}`);
      console.log('========================================================================');
      process.exit(0);
    } else {
      console.error('=== [STEP 4a VERIFICATION FAILED] ===');
      console.error(result.error);
      process.exit(1);
    }
  });

  const testHtmlPath = path.join(__dirname, 'step4a_capture_page.html');
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <script>
    const { ipcRenderer } = require('electron');

    async function testCapture() {
      try {
        const sources = await ipcRenderer.invoke('get-desktop-sources');
        if (!sources || sources.length === 0) {
          throw new Error('No desktop screen sources found via desktopCapturer.');
        }

        const screenSource = sources.find(s => s.id.startsWith('screen')) || sources[0];

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: screenSource.id,
              minWidth: 1280,
              maxWidth: 3840,
              minHeight: 720,
              maxHeight: 2160
            }
          }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          setTimeout(() => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');

            stream.getTracks().forEach(t => t.stop());

            ipcRenderer.send('report-capture-result', {
              success: canvas.width > 0 && canvas.height > 0 && dataUrl.length > 50000,
              width: canvas.width,
              height: canvas.height,
              sourceId: screenSource.id,
              sourceName: screenSource.name,
              dataUrlLength: dataUrl.length,
              dataUrl: dataUrl
            });
          }, 200);
        };
      } catch (err) {
        ipcRenderer.send('report-capture-result', {
          success: false,
          error: err.message
        });
      }
    }

    testCapture();
  </script>
</body>
</html>`;

  fs.writeFileSync(testHtmlPath, htmlContent);
  win.loadFile(testHtmlPath);
});
