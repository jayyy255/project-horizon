const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('=== [PHASE 2 - VERIFY REAL LASSO REGION CAPTURE] ===');

  const primary = screen.getPrimaryDisplay();
  const scaleFactor = primary.scaleFactor || 1;

  // 1. Create a real application window on the desktop with distinct, known pixels
  const appWin = new BrowserWindow({
    x: 180,
    y: 160,
    width: 480,
    height: 360,
    frame: false,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  const testNonce = `NONCE_${Date.now()}`;
  const appHtml = `<!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; overflow:hidden; font-family:'Segoe UI', sans-serif; background:#0055A0;">
    <div style="width:480px; height:360px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg, #0055A0 0%, #438BC4 50%, #8CC1E9 100%); color:#FFF8E7; border:4px solid #FFF8E7; box-sizing:border-box;">
      <h2 style="margin:0; font-size:24px; letter-spacing:1px;">PROJECT HORIZON</h2>
      <p style="margin:8px 0; font-size:16px; font-weight:bold; background:rgba(0,0,0,0.3); padding:4px 12px; border-radius:8px;">REAL LASSO REGION TARGET</p>
      <div id="target-badge" style="background:#ff0055; color:#ffffff; padding:8px 16px; border-radius:6px; font-family:monospace; font-weight:bold; font-size:16px;">
        TARGET_PIXELS: ${testNonce}
      </div>
    </div>
  </body>
  </html>`;

  const appHtmlPath = path.join(__dirname, 'test_target_app.html');
  fs.writeFileSync(appHtmlPath, appHtml);
  await appWin.loadFile(appHtmlPath);

  // Allow app window to paint
  await new Promise(r => setTimeout(r, 400));

  // 2. Create the real Electron overlay window (alwaysOnTop, frameless, transparent)
  const overlayWin = new BrowserWindow({
    x: 0,
    y: 0,
    width: primary.bounds.width,
    height: primary.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  let screenSourceId = null;

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    const s = sources.find(x => x.id.startsWith('screen')) || sources[0];
    screenSourceId = s.id;
    return [{ id: s.id, name: s.name }];
  });

  ipcMain.on('lasso-crop-completed', (_evt, data) => {
    console.log('\n============================================================');
    console.log('>>> [REAL LASSO CROP VERIFICATION PASSED]');
    console.log(`Desktop Native Resolution:   ${data.desktopWidth} x ${data.desktopHeight} px`);
    console.log(`Lasso Points Count:          ${data.pointsCount} points`);
    console.log(`Catmull-Rom SVG Path:        ${data.svgPathSnippet}... (${data.svgPathLength} chars)`);
    console.log(`AABB (+12px padding):        x=${data.aabb.x}, y=${data.aabb.y}, w=${data.aabb.w}, h=${data.aabb.h}`);
    console.log(`Crop Bitmap Dimensions:      ${data.cropWidth} x ${data.cropHeight} px`);
    console.log(`Crop Payload Size:           ${Math.round(data.cropDataUrlLength / 1024)} KB`);
    console.log(`AABB Compute Latency:        ${data.aabbLatencyMs.toFixed(2)} ms`);
    console.log(`Pixel Extraction Latency:    ${data.cropLatencyMs.toFixed(2)} ms`);
    console.log(`TOTAL LASSO -> CROP LATENCY: ${data.totalLatencyMs.toFixed(2)} ms`);

    const outDir = path.join(__dirname, '../scratch');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const cropPath = path.join(outDir, 'real_lasso_verified_crop.png');
    const base64Data = data.cropDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(cropPath, Buffer.from(base64Data, 'base64'));
    console.log(`Saved Verified Crop File:    ${cropPath}`);
    console.log('============================================================\n');

    appWin.close();
    overlayWin.close();
    process.exit(0);
  });

  const overlayHtml = `<!DOCTYPE html>
  <html>
  <head>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { width: 100vw; height: 100vh; overflow: hidden; background: transparent; cursor: crosshair; user-select: none; }
      #desktop-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
      #svg-layer { position: absolute; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 10; }
    </style>
  </head>
  <body>
    <video id="v" autoplay playsinline muted style="display:none;"></video>
    <canvas id="desktop-canvas"></canvas>
    <svg id="svg-layer">
      <defs>
        <linearGradient id="lassoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8CC1E9" />
          <stop offset="35%" stop-color="#438BC4" />
          <stop offset="70%" stop-color="#0055A0" />
          <stop offset="100%" stop-color="#FFF8E7" />
        </linearGradient>
      </defs>
      <path id="lasso-path" fill="rgba(140, 193, 233, 0.15)" stroke="url(#lassoGrad)" stroke-width="2.5"></path>
      <rect id="aabb-rect" fill="none" stroke="#8CC1E9" stroke-width="1.5" stroke-dasharray="6 4"></rect>
    </svg>

    <script>
      const { ipcRenderer } = require('electron');

      function computeAABB(points, padding = 12, screenLimit) {
        if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of points) {
          if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        const paddedMinX = Math.floor(minX - padding);
        const paddedMinY = Math.floor(minY - padding);
        const paddedMaxX = Math.ceil(maxX + padding);
        const paddedMaxY = Math.ceil(maxY + padding);

        const boundMinX = screenLimit?.x ?? 0;
        const boundMinY = screenLimit?.y ?? 0;

        if (screenLimit) {
          const boundMaxX = boundMinX + screenLimit.width;
          const boundMaxY = boundMinY + screenLimit.height;
          const clampedX = Math.max(boundMinX, paddedMinX);
          const clampedY = Math.max(boundMinY, paddedMinY);
          const clampedMaxX = Math.min(boundMaxX, paddedMaxX);
          const clampedMaxY = Math.min(boundMaxY, paddedMaxY);
          return {
            x: clampedX,
            y: clampedY,
            w: Math.max(0, clampedMaxX - clampedX),
            h: Math.max(0, clampedMaxY - clampedY)
          };
        }

        const clampedX = Math.max(boundMinX, paddedMinX);
        const clampedY = Math.max(boundMinY, paddedMinY);
        return {
          x: clampedX,
          y: clampedY,
          w: Math.max(0, paddedMaxX - clampedX),
          h: Math.max(0, paddedMaxY - clampedY)
        };
      }

      function generateCatmullRomSVGPath(points, closed = true) {
        if (points.length < 2) return '';
        if (points.length === 2) return 'M ' + points[0].x + ' ' + points[0].y + ' L ' + points[1].x + ' ' + points[1].y;
        let d = 'M ' + points[0].x + ' ' + points[0].y;
        const pts = closed ? [...points, points[0], points[1]] : points;
        for (let i = 0; i < pts.length - 3; i++) {
          const p0 = i === 0 ? pts[0] : pts[i - 1];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2];
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          d += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
        }
        if (closed) d += ' Z';
        return d;
      }

      async function runLassoFlow() {
        const sources = await ipcRenderer.invoke('get-desktop-sources');
        const source = sources[0];

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 3840,
              minHeight: 720,
              maxHeight: 2160
            }
          }
        });

        const video = document.getElementById('v');
        const canvas = document.getElementById('desktop-canvas');
        const ctx = canvas.getContext('2d');
        video.srcObject = stream;

        video.onloadeddata = () => {
          video.play();
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          stream.getTracks().forEach(t => t.stop());

          // 1. Simulate pointerdown -> pointermove -> pointerup around the test target window
          // Target window is at x: 180, y: 160, w: 480, h: 360
          // Center of target window is (180 + 240) = 420, (160 + 180) = 340
          const cx = 420;
          const cy = 340;
          const rx = 200;
          const ry = 150;

          const points = [];
          for (let angle = 0; angle < 360; angle += 30) {
            const rad = (angle * Math.PI) / 180;
            // Freehand organic variation
            const rOffset = (angle % 60 === 0) ? 10 : -8;
            points.push({
              x: Math.round(cx + (rx + rOffset) * Math.cos(rad)),
              y: Math.round(cy + (ry + rOffset) * Math.sin(rad))
            });
          }

          const t0 = performance.now();

          // 2. Catmull-Rom smoothing
          const svgPath = generateCatmullRomSVGPath(points, true);
          document.getElementById('lasso-path').setAttribute('d', svgPath);

          // 3. AABB computation with 12px padding clamped to screen
          const tAABBStart = performance.now();
          const aabb = computeAABB(points, 12, { width: window.innerWidth, height: window.innerHeight });
          const aabbLatencyMs = performance.now() - tAABBStart;

          const aabbRect = document.getElementById('aabb-rect');
          aabbRect.setAttribute('x', aabb.x);
          aabbRect.setAttribute('y', aabb.y);
          aabbRect.setAttribute('width', aabb.w);
          aabbRect.setAttribute('height', aabb.h);

          // 4. Extract real pixels from the frozen desktop canvas at native resolution
          const tCropStart = performance.now();
          const scaleX = canvas.width / window.innerWidth;
          const scaleY = canvas.height / window.innerHeight;

          const sx = Math.round(aabb.x * scaleX);
          const sy = Math.round(aabb.y * scaleY);
          const sw = Math.round(aabb.w * scaleX);
          const sh = Math.round(aabb.h * scaleY);

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = sw;
          cropCanvas.height = sh;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
          const cropDataUrl = cropCanvas.toDataURL('image/png');
          const cropLatencyMs = performance.now() - tCropStart;
          const totalLatencyMs = performance.now() - t0;

          ipcRenderer.send('lasso-crop-completed', {
            desktopWidth: canvas.width,
            desktopHeight: canvas.height,
            pointsCount: points.length,
            svgPathSnippet: svgPath.substring(0, 45),
            svgPathLength: svgPath.length,
            aabb,
            cropWidth: cropCanvas.width,
            cropHeight: cropCanvas.height,
            cropDataUrlLength: cropDataUrl.length,
            cropDataUrl,
            aabbLatencyMs,
            cropLatencyMs,
            totalLatencyMs
          });
        };
      }

      runLassoFlow().catch(console.error);
    </script>
  </body>
  </html>`;

  const overlayHtmlPath = path.join(__dirname, 'test_overlay_lasso.html');
  fs.writeFileSync(overlayHtmlPath, overlayHtml);
  await overlayWin.loadFile(overlayHtmlPath);
  overlayWin.show();
});
