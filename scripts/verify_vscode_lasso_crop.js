const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('=== [VERIFYING REAL LASSO CROP OVER ACTIVE DESKTOP & VS CODE] ===');

  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.bounds;

  // Real Electron Overlay Window (transparent, frameless, alwaysOnTop)
  const overlayWin = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
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

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    const s = sources.find(x => x.id.startsWith('screen')) || sources[0];
    return [{ id: s.id, name: s.name }];
  });

  ipcMain.on('report-vscode-crop', (_evt, data) => {
    console.log('\n============================================================');
    console.log('>>> [REAL ACTIVE DESKTOP / VS CODE LASSO CROP EXTRACTED]');
    console.log(`Resolution:                  ${data.desktopWidth} x ${data.desktopHeight} px`);
    console.log(`Lasso Smooth Points:         ${data.pointsCount} points`);
    console.log(`AABB (+12px padding):        x=${data.aabb.x}, y=${data.aabb.y}, w=${data.aabb.w}, h=${data.aabb.h}`);
    console.log(`Cropped Bitmap:              ${data.cropWidth} x ${data.cropHeight} px`);
    console.log(`Payload Size:                ${Math.round(data.cropDataUrlLength / 1024)} KB`);
    console.log(`AABB Calculation Latency:    ${data.aabbMs.toFixed(2)} ms`);
    console.log(`Pixel Extraction Latency:    ${data.extractMs.toFixed(2)} ms`);
    console.log(`TOTAL LASSO -> CROP LATENCY: ${data.totalMs.toFixed(2)} ms`);

    const outDir = path.join(__dirname, '../scratch');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const cropPath = path.join(outDir, 'real_vscode_lasso_crop.png');
    const base64Data = data.cropDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(cropPath, Buffer.from(base64Data, 'base64'));
    console.log(`Saved Verified Crop File:    ${cropPath}`);
    console.log('============================================================\n');

    overlayWin.close();
    process.exit(0);
  });

  const overlayHtml = `<!DOCTYPE html>
  <html>
  <head>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { width: 100vw; height: 100vh; overflow: hidden; background: transparent; cursor: crosshair; }
      #desktop-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
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

      async function run() {
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

          // Circle a real active workspace region on the desktop (center-left)
          // cx: 500, cy: 380, rx: 240, ry: 160
          const cx = 500;
          const cy = 380;
          const rx = 240;
          const ry = 160;

          const points = [];
          for (let angle = 0; angle < 360; angle += 24) {
            const rad = (angle * Math.PI) / 180;
            const rJitter = (angle % 48 === 0) ? 12 : -8;
            points.push({
              x: Math.round(cx + (rx + rJitter) * Math.cos(rad)),
              y: Math.round(cy + (ry + rJitter) * Math.sin(rad))
            });
          }

          const t0 = performance.now();

          // Catmull-Rom smoothing
          const svgPath = generateCatmullRomSVGPath(points, true);
          document.getElementById('lasso-path').setAttribute('d', svgPath);

          // AABB with 12px padding
          const tAABBStart = performance.now();
          const aabb = computeAABB(points, 12, { width: window.innerWidth, height: window.innerHeight });
          const aabbMs = performance.now() - tAABBStart;

          const aabbRect = document.getElementById('aabb-rect');
          aabbRect.setAttribute('x', aabb.x);
          aabbRect.setAttribute('y', aabb.y);
          aabbRect.setAttribute('width', aabb.w);
          aabbRect.setAttribute('height', aabb.h);

          // Extract real pixels at native resolution
          const tExtractStart = performance.now();
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
          const extractMs = performance.now() - tExtractStart;
          const totalMs = performance.now() - t0;

          ipcRenderer.send('report-vscode-crop', {
            desktopWidth: canvas.width,
            desktopHeight: canvas.height,
            pointsCount: points.length,
            aabb,
            cropWidth: cropCanvas.width,
            cropHeight: cropCanvas.height,
            cropDataUrlLength: cropDataUrl.length,
            cropDataUrl,
            aabbMs,
            extractMs,
            totalMs
          });
        };
      }

      run().catch(console.error);
    </script>
  </body>
  </html>`;

  const overlayHtmlPath = path.join(__dirname, 'test_overlay_vscode.html');
  fs.writeFileSync(overlayHtmlPath, overlayHtml);
  await overlayWin.loadFile(overlayHtmlPath);
  overlayWin.show();
});
