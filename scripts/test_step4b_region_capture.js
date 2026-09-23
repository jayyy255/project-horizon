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

  ipcMain.on('report-step4b-result', (_event, result) => {
    if (result.success) {
      console.log('=== [STEP 4b VERIFICATION: REAL REGION / LASSO CAPTURE SUCCESS] ===');
      console.log(`Full Desktop Resolution: ${result.desktopWidth} x ${result.desktopHeight} px`);
      console.log(`Lasso Input Points: ${result.pointsCount} points`);
      console.log(`Catmull-Rom SVG Path: ${result.svgPathSnippet}... (Length: ${result.svgPathLength} chars)`);
      console.log(`Computed AABB (+12px padding): x=${result.aabb.x}, y=${result.aabb.y}, w=${result.aabb.w}, h=${result.aabb.h}`);
      console.log(`Cropped Bitmap: ${result.cropWidth} x ${result.cropHeight} px | Size: ${Math.round(result.cropDataUrlLength / 1024)} KB`);

      const base64Data = result.cropDataUrl.replace(/^data:image\/png;base64,/, '');
      const outDir = path.join(__dirname, '../scratch');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const outPath = path.join(outDir, 'step4b_actual_cropped_region.png');
      fs.writeFileSync(outPath, base64Data, 'base64');
      console.log(`Saved actual cropped desktop region to: ${outPath}`);
      console.log('===================================================================');
      process.exit(0);
    } else {
      console.error('=== [STEP 4b VERIFICATION FAILED] ===');
      console.error(result.error);
      process.exit(1);
    }
  });

  const testHtmlPath = path.join(__dirname, 'step4b_region_page.html');
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <script>
    const { ipcRenderer } = require('electron');

    // Catmull-Rom & AABB calculation logic
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
      let paddedX = Math.max(0, Math.floor(minX - padding));
      let paddedY = Math.max(0, Math.floor(minY - padding));
      let paddedMaxX = Math.ceil(maxX + padding);
      let paddedMaxY = Math.ceil(maxY + padding);
      if (screenLimit) {
        paddedMaxX = Math.min(screenLimit.width, paddedMaxX);
        paddedMaxY = Math.min(screenLimit.height, paddedMaxY);
      }
      return {
        x: paddedX,
        y: paddedY,
        w: Math.max(0, paddedMaxX - paddedX),
        h: Math.max(0, paddedMaxY - paddedY)
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

    async function testRegionCapture() {
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

            stream.getTracks().forEach(t => t.stop());

            // 1. Simulate a freehand lasso selection around the center region
            const centerX = Math.round(canvas.width / 2);
            const centerY = Math.round(canvas.height / 2);
            const radius = 150;
            const points = [];
            for (let angle = 0; angle < 360; angle += 30) {
              const rad = (angle * Math.PI) / 180;
              // Add slight organic jitter to simulate natural human freehand drag
              const r = radius + (angle % 60 === 0 ? 15 : -10);
              points.push({
                x: Math.round(centerX + r * Math.cos(rad)),
                y: Math.round(centerY + r * Math.sin(rad))
              });
            }

            // 2. Compute Catmull-Rom path
            const svgPath = generateCatmullRomSVGPath(points, true);

            // 3. Compute AABB with 12px padding
            const aabb = computeAABB(points, 12, { width: canvas.width, height: canvas.height });

            // 4. Crop that exact region from the real desktop bitmap
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = aabb.w;
            cropCanvas.height = aabb.h;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(canvas, aabb.x, aabb.y, aabb.w, aabb.h, 0, 0, aabb.w, aabb.h);
            const cropDataUrl = cropCanvas.toDataURL('image/png');

            ipcRenderer.send('report-step4b-result', {
              success: aabb.w > 0 && aabb.h > 0 && cropDataUrl.length > 5000,
              desktopWidth: canvas.width,
              desktopHeight: canvas.height,
              pointsCount: points.length,
              svgPathSnippet: svgPath.substring(0, 60),
              svgPathLength: svgPath.length,
              aabb: aabb,
              cropWidth: cropCanvas.width,
              cropHeight: cropCanvas.height,
              cropDataUrlLength: cropDataUrl.length,
              cropDataUrl: cropDataUrl
            });
          }, 200);
        };
      } catch (err) {
        ipcRenderer.send('report-step4b-result', {
          success: false,
          error: err.message
        });
      }
    }

    testRegionCapture();
  </script>
</body>
</html>`;

  fs.writeFileSync(testHtmlPath, htmlContent);
  win.loadFile(testHtmlPath);
});
