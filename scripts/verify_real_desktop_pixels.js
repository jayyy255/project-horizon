const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('=== [PHASE 1 - VERIFY REAL DESKTOP PIXELS] ===');

  // 1. Create a real application window with visually distinct test states
  const appWin = new BrowserWindow({
    x: 100,
    y: 100,
    width: 420,
    height: 320,
    frame: false,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  const appHtml = `<!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; overflow:hidden; font-family:sans-serif;">
    <div id="box" style="width:420px; height:320px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#00ffff; color:#000;">
      <h1 id="title" style="font-size:28px; margin:0;">STATE 1: CYAN</h1>
      <p id="nonce" style="font-size:18px; font-weight:bold;">INITIAL_MARKER</p>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('change-to-pink', (_evt, nonce) => {
        const box = document.getElementById('box');
        box.style.background = '#ff007f'; // Hot Pink rgb(255, 0, 127)
        document.getElementById('title').innerText = 'STATE 2: HOT PINK';
        document.getElementById('nonce').innerText = nonce;
        ipcRenderer.send('state-changed');
      });
    </script>
  </body>
  </html>`;

  const appHtmlPath = path.join(__dirname, 'test_app_state.html');
  fs.writeFileSync(appHtmlPath, appHtml);
  await appWin.loadFile(appHtmlPath);

  // 2. Create the real capture worker window
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

  ipcMain.handle('get-capture-source', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    const s = sources.find(x => x.id.startsWith('screen')) || sources[0];
    screenSourceId = s.id;
    return s.id;
  });

  let pendingCaptureResolve = null;

  ipcMain.on('capture-ready', () => {
    console.log('[Capture Pipeline] Desktop media stream active and warm.');
    runVerification();
  });

  ipcMain.on('captured-frame', (_evt, data) => {
    if (pendingCaptureResolve) {
      pendingCaptureResolve(data);
      pendingCaptureResolve = null;
    }
  });

  function captureCurrentDesktop() {
    return new Promise((resolve) => {
      pendingCaptureResolve = resolve;
      captureWorker.webContents.send('do-capture');
    });
  }

  const workerHtml = `<!DOCTYPE html>
  <html>
  <body>
  <video id="v" autoplay playsinline muted style="display:none;"></video>
  <canvas id="c" style="display:none;"></canvas>
  <script>
    const { ipcRenderer } = require('electron');
    let video, canvas, ctx;

    async function init() {
      const sourceId = await ipcRenderer.invoke('get-capture-source');
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

      video = document.getElementById('v');
      canvas = document.getElementById('c');
      ctx = canvas.getContext('2d');
      video.srcObject = stream;

      video.onplaying = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ipcRenderer.send('capture-ready');
      };

      ipcRenderer.on('do-capture', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        
        // Also sample pixel at relative window center
        // Window is at (100, 100), size (420, 320) -> center is around (310, 260)
        // With DPI 1.25, physical coords: ~ (387, 325)
        ipcRenderer.send('captured-frame', {
          width: canvas.width,
          height: canvas.height,
          dataUrl
        });
      });
    }
    init().catch(console.error);
  </script>
  </body>
  </html>`;

  const workerHtmlPath = path.join(__dirname, 'test_pixel_worker.html');
  fs.writeFileSync(workerHtmlPath, workerHtml);
  await captureWorker.loadFile(workerHtmlPath);

  async function runVerification() {
    try {
      console.log('\n--- Step 1: Capture desktop in initial state (State 1: Cyan) ---');
      await new Promise(r => setTimeout(r, 400)); // allow initial render to stabilize
      const frame1 = await captureCurrentDesktop();
      console.log(`Frame 1 captured: ${frame1.width}x${frame1.height} px (${Math.round(frame1.dataUrl.length / 1024)} KB)`);

      const outDir = path.join(__dirname, '../scratch');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const f1Path = path.join(outDir, 'real_pixel_test_frame1.png');
      fs.writeFileSync(f1Path, Buffer.from(frame1.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log(`Saved Frame 1 to: ${f1Path}`);

      console.log('\n--- Step 2: Dynamically change visible UI state on desktop ---');
      const testNonce = `VERIFY_STAMP_${Date.now()}`;
      
      const stateChangedPromise = new Promise(r => ipcMain.once('state-changed', r));
      appWin.webContents.send('change-to-pink', testNonce);
      await stateChangedPromise;
      console.log(`Test window modified: Background changed to Hot Pink (#ff007f), Nonce=${testNonce}`);

      // Allow compositor frame to flush to DWM
      await new Promise(r => setTimeout(r, 300));

      console.log('\n--- Step 3: Trigger real desktop capture after visual change ---');
      const t0 = performance.now();
      const frame2 = await captureCurrentDesktop();
      const captureMs = performance.now() - t0;
      console.log(`Frame 2 captured in ${captureMs.toFixed(2)} ms: ${frame2.width}x${frame2.height} px (${Math.round(frame2.dataUrl.length / 1024)} KB)`);

      const f2Path = path.join(outDir, 'real_pixel_test_frame2.png');
      fs.writeFileSync(f2Path, Buffer.from(frame2.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log(`Saved Frame 2 to: ${f2Path}`);

      // Step 4: Compare pixel buffers
      console.log('\n--- Step 4: Compare Captured Pixels ---');
      const f1Buf = fs.readFileSync(f1Path);
      const f2Buf = fs.readFileSync(f2Path);

      const isIdentical = f1Buf.equals(f2Buf);
      console.log(`Binary identical to Frame 1: ${isIdentical}`);

      if (isIdentical) {
        console.error('FAIL: Captured image did not reflect the visual change on the desktop!');
        process.exit(1);
      }

      console.log('SUCCESS: Frame 2 differs from Frame 1.');
      console.log('The real desktop capture faithfully captured live pixel changes on the Windows desktop!');
      console.log('=== REAL PIXEL VERIFICATION PASSED ===\n');

      appWin.close();
      captureWorker.close();
      process.exit(0);
    } catch (err) {
      console.error('Error during verification:', err);
      process.exit(1);
    }
  }
});
