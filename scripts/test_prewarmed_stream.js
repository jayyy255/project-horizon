const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('App ready. Initializing pre-warmed desktop capture stream...');

  // Create invisible worker window for pre-warmed capture
  const captureWorker = new BrowserWindow({
    width: 320,
    height: 240,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  let screenSourceId = null;

  ipcMain.handle('get-initial-source', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    const s = sources.find(x => x.id.startsWith('screen')) || sources[0];
    screenSourceId = s.id;
    console.log(`[Worker] Pre-warm screen source initialized: ${s.name} (${s.id})`);
    return s.id;
  });

  let onFrameGrabbed = null;

  ipcMain.on('stream-ready', () => {
    console.log('[Worker] Real desktop stream is warm and running at native 60fps!');
    
    // Simulate Hotkey pressed after 500ms
    setTimeout(() => {
      console.log('\n--- SIMULATING GLOBAL HOTKEY Win+Shift+C ---');
      const t0 = performance.now();

      onFrameGrabbed = (metrics) => {
        const tTotal = performance.now() - t0;
        console.log(`Frame grabbed in: ${metrics.grabMs.toFixed(2)} ms`);
        console.log(`Canvas toDataURL took: ${metrics.dataUrlMs.toFixed(2)} ms`);
        console.log(`TOTAL HOTKEY -> FRAME AVAILABLE LATENCY: ${tTotal.toFixed(2)} ms`);
        console.log(`Resolution: ${metrics.width}x${metrics.height}`);
        console.log(`Payload size: ${Math.round(metrics.dataUrlLen / 1024)} KB`);
        console.log('--- TEST FINISHED SUCCESSFULLY ---');
        process.exit(0);
      };

      captureWorker.webContents.send('grab-frame');
    }, 500);
  });

  ipcMain.on('frame-result', (_evt, data) => {
    if (onFrameGrabbed) {
      onFrameGrabbed(data);
    }
  });

  const workerHtml = `<!DOCTYPE html>
  <html>
  <body>
  <video id="v" autoplay playsinline muted></video>
  <canvas id="c"></canvas>
  <script>
    const { ipcRenderer } = require('electron');
    let videoEl, canvasEl, ctx;

    async function init() {
      const sourceId = await ipcRenderer.invoke('get-initial-source');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160,
            maxFrameRate: 60
          }
        }
      });

      videoEl = document.getElementById('v');
      canvasEl = document.getElementById('c');
      ctx = canvasEl.getContext('2d');
      videoEl.srcObject = stream;

      videoEl.onplaying = () => {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ipcRenderer.send('stream-ready');
      };

      ipcRenderer.on('grab-frame', () => {
        const t0 = performance.now();
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        const t1 = performance.now();
        const dataUrl = canvasEl.toDataURL('image/jpeg', 0.90);
        const t2 = performance.now();

        ipcRenderer.send('frame-result', {
          width: canvasEl.width,
          height: canvasEl.height,
          grabMs: t1 - t0,
          dataUrlMs: t2 - t1,
          dataUrlLen: dataUrl.length
        });
      });
    }
    init().catch(console.error);
  </script>
  </body>
  </html>`;

  const htmlPath = path.join(__dirname, 'worker_capture.html');
  fs.writeFileSync(htmlPath, workerHtml);
  captureWorker.loadFile(htmlPath);
});
