const { app, BrowserWindow, desktopCapturer, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  // IMPORTANT: Keep window HIDDEN (show: false) while desktop capture is in progress
  // so the window never captures itself or flashes white/blank on screen!
  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width: width,
    height: height,
    fullscreen: true,
    alwaysOnTop: true,
    frame: false,
    show: false,
    backgroundColor: '#090a0d',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  ipcMain.on('capture-ready', (_event, dims) => {
    console.log(`[Project Horizon] Desktop frame captured: ${dims.w}x${dims.h}px. Displaying live overlay.`);
    win.show();
    win.focus();
  });

  ipcMain.on('save-lasso-crop', (_event, payload) => {
    try {
      const base64Data = payload.dataUrl.replace(/^data:image\/png;base64,/, '');
      const outDir = path.join(__dirname, '../scratch');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `user_lasso_crop_${timestamp}.png`;
      const outPath = path.join(outDir, filename);
      fs.writeFileSync(outPath, base64Data, 'base64');

      // Also update latest copy with safe fallback
      const latestPath = path.join(outDir, 'user_lasso_screenshot.png');
      try {
        fs.writeFileSync(latestPath, base64Data, 'base64');
      } catch (lockErr) {
        // Locked by external viewer, ignore
      }

      console.log('\n================================================================');
      console.log('>>> [SUCCESS] Interactive Lasso Screenshot Captured!');
      console.log(`    Crop Dimensions: ${payload.width} x ${payload.height} px`);
      console.log(`    Saved to: ${outPath}`);
      console.log('================================================================\n');

      // Open the captured file directly in Windows
      shell.openPath(outPath);

      setTimeout(() => {
        app.quit();
      }, 700);
    } catch (err) {
      console.error('Failed to save crop:', err);
      app.quit();
    }
  });

  ipcMain.on('exit-lasso', () => {
    console.log('[Project Horizon] Lasso test closed by user.');
    app.quit();
  });

  const htmlPath = path.join(__dirname, 'interactive_lasso.html');
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Horizon — Live Lasso Screen Capture</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100vw; height: 100vh; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; cursor: crosshair; user-select: none; }
    #desktop-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
    #svg-layer { position: absolute; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 10; }
    #toolbar {
      position: absolute; top: 20px; right: 24px; z-index: 50; display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; border-radius: 16px; background: rgba(15, 20, 28, 0.88); backdrop-filter: blur(20px);
      border: 1px solid rgba(140, 193, 233, 0.4); box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    }
    .btn {
      padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: none;
      display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0055A0, #438BC4, #8CC1E9); color: #FFF8E7;
      box-shadow: 0 4px 14px rgba(67, 139, 196, 0.45); border: 1px solid rgba(255, 248, 231, 0.3);
    }
    .btn-primary:hover { filter: brightness(1.15); transform: translateY(-1px); }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08); color: #8CC1E9; border: 1px solid rgba(140, 193, 233, 0.3);
    }
    .btn-secondary:hover { background: rgba(140, 193, 233, 0.2); }
    .btn-exit {
      background: transparent; color: #94a3b8;
    }
    .btn-exit:hover { color: #f43f5e; }
    #banner {
      position: absolute; top: 20px; left: 24px; z-index: 50;
      padding: 8px 16px; border-radius: 9999px; background: rgba(15, 20, 28, 0.88); backdrop-filter: blur(20px);
      border: 1px solid rgba(140, 193, 233, 0.4); color: #FFF8E7; font-size: 12px; font-family: monospace;
      display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #8CC1E9; box-shadow: 0 0 10px #8CC1E9; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
    #instruction {
      position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 50;
      padding: 9px 22px; border-radius: 9999px; background: rgba(15, 20, 28, 0.88); backdrop-filter: blur(20px);
      border: 1px solid rgba(140, 193, 233, 0.35); color: #8CC1E9; font-size: 13px; font-family: monospace;
      pointer-events: none; transition: opacity 0.3s; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div id="banner">
    <span class="pulse-dot"></span>
    <span id="banner-text">Desktop Frozen · Circle any region</span>
  </div>

  <div id="toolbar">
    <button id="btn-attach" class="btn btn-primary" style="display: none;">
      <span>&#10003; Attach Selection</span>
      <span id="btn-coords" style="font-family: monospace; font-size: 11px; opacity: 0.9;"></span>
    </button>
    <button id="btn-clear" class="btn btn-secondary" style="display: none;">Clear</button>
    <button id="btn-fullscreen" class="btn btn-secondary">Full Screen</button>
    <button id="btn-exit" class="btn btn-exit"><kbd style="font-size:10px; background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #334155;">ESC</kbd> Exit</button>
  </div>

  <div id="instruction">Click and drag your mouse anywhere to circle a region</div>

  <canvas id="desktop-canvas"></canvas>

  <svg id="svg-layer">
    <defs>
      <linearGradient id="lassoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8CC1E9" />
        <stop offset="35%" stop-color="#438BC4" />
        <stop offset="70%" stop-color="#0055A0" />
        <stop offset="100%" stop-color="#FFF8E7" />
      </linearGradient>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path id="lasso-path" fill="rgba(140, 193, 233, 0.12)" stroke="url(#lassoGrad)" stroke-width="2.5" filter="url(#glow)"></path>
    <rect id="aabb-rect" fill="none" stroke="#8CC1E9" stroke-width="1.5" stroke-dasharray="6 4" style="display:none;"></rect>
    <g id="badge-group" style="display:none;">
      <rect id="badge-bg" rx="4" ry="4" fill="rgba(0, 85, 160, 0.9)" stroke="rgba(140, 193, 233, 0.6)" stroke-width="1"></rect>
      <text id="badge-text" fill="#FFF8E7" font-size="11" font-family="monospace" dy="13" dx="8"></text>
    </g>
  </svg>

  <script>
    const { ipcRenderer } = require('electron');

    const canvas = document.getElementById('desktop-canvas');
    const ctx = canvas.getContext('2d');
    const lassoPath = document.getElementById('lasso-path');
    const aabbRect = document.getElementById('aabb-rect');
    const badgeGroup = document.getElementById('badge-group');
    const badgeBg = document.getElementById('badge-bg');
    const badgeText = document.getElementById('badge-text');
    const btnAttach = document.getElementById('btn-attach');
    const btnCoords = document.getElementById('btn-coords');
    const btnClear = document.getElementById('btn-clear');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnExit = document.getElementById('btn-exit');
    const bannerText = document.getElementById('banner-text');
    const instruction = document.getElementById('instruction');

    let isDrawing = false;
    let points = [];
    let currentAABB = null;

    function computeAABB(pts, padding = 12) {
      if (!pts || pts.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const x = Math.max(0, Math.floor(minX - padding));
      const y = Math.max(0, Math.floor(minY - padding));
      const w = Math.min(window.innerWidth - x, Math.ceil(maxX + padding) - x);
      const h = Math.min(window.innerHeight - y, Math.ceil(maxY + padding) - y);
      return { x, y, w, h };
    }

    function generateCatmullRomSVGPath(pts, closed = true) {
      if (pts.length < 2) return '';
      if (pts.length === 2) return 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + pts[1].x + ' ' + pts[1].y;
      let d = 'M ' + pts[0].x + ' ' + pts[0].y;
      const list = closed ? [...pts, pts[0], pts[1]] : pts;
      for (let i = 0; i < list.length - 3; i++) {
        const p0 = i === 0 ? list[0] : list[i - 1];
        const p1 = list[i];
        const p2 = list[i + 1];
        const p3 = list[i + 2];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      if (closed) d += ' Z';
      return d;
    }

    function renderSelection(closed = true) {
      if (points.length < 2) {
        lassoPath.setAttribute('d', '');
        aabbRect.style.display = 'none';
        badgeGroup.style.display = 'none';
        btnAttach.style.display = 'none';
        btnClear.style.display = 'none';
        return;
      }

      lassoPath.setAttribute('d', generateCatmullRomSVGPath(points, closed));
      currentAABB = computeAABB(points, 12);

      if (currentAABB && currentAABB.w > 4 && currentAABB.h > 4) {
        aabbRect.style.display = 'block';
        aabbRect.setAttribute('x', currentAABB.x);
        aabbRect.setAttribute('y', currentAABB.y);
        aabbRect.setAttribute('width', currentAABB.w);
        aabbRect.setAttribute('height', currentAABB.h);

        badgeGroup.style.display = 'block';
        const badgeX = Math.max(8, currentAABB.x);
        const badgeY = Math.max(8, currentAABB.y - 24);
        badgeGroup.setAttribute('transform', 'translate(' + badgeX + ',' + badgeY + ')');
        const text = currentAABB.w + '×' + currentAABB.h + 'px (+12px)';
        badgeText.textContent = text;
        badgeBg.setAttribute('width', text.length * 8.2);
        badgeBg.setAttribute('height', 18);

        btnAttach.style.display = 'inline-flex';
        btnCoords.textContent = '(' + currentAABB.w + '×' + currentAABB.h + 'px)';
        btnClear.style.display = 'inline-flex';
        instruction.style.opacity = '0';
      }
    }

    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('#toolbar')) return;
      isDrawing = true;
      points = [{ x: e.clientX, y: e.clientY }];
      renderSelection(false);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const last = points[points.length - 1];
      const distSq = (e.clientX - last.x) ** 2 + (e.clientY - last.y) ** 2;
      if (distSq >= 16) {
        points.push({ x: e.clientX, y: e.clientY });
        renderSelection(false);
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDrawing) return;
      isDrawing = false;
      renderSelection(true);
    });

    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      points = [];
      currentAABB = null;
      renderSelection(false);
      instruction.style.opacity = '1';
    });

    btnExit.addEventListener('click', () => ipcRenderer.send('exit-lasso'));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') ipcRenderer.send('exit-lasso');
    });

    btnAttach.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentAABB) return;

      // Scale coordinates from window client space to canvas bitmap space
      const scaleX = canvas.width / window.innerWidth;
      const scaleY = canvas.height / window.innerHeight;

      const sx = Math.round(currentAABB.x * scaleX);
      const sy = Math.round(currentAABB.y * scaleY);
      const sw = Math.round(currentAABB.w * scaleX);
      const sh = Math.round(currentAABB.h * scaleY);

      const crop = document.createElement('canvas');
      crop.width = sw;
      crop.height = sh;
      const cropCtx = crop.getContext('2d');
      cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = crop.toDataURL('image/png');

      ipcRenderer.send('save-lasso-crop', {
        dataUrl,
        width: sw,
        height: sh,
        coords: currentAABB
      });
    });

    btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      const dataUrl = canvas.toDataURL('image/png');
      ipcRenderer.send('save-lasso-crop', {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        coords: { x: 0, y: 0, w: canvas.width, h: canvas.height }
      });
    });

    async function initDesktopCapture() {
      try {
        const sources = await ipcRenderer.invoke('get-desktop-sources');
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
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.display = 'none';
        document.body.appendChild(video);

        video.srcObject = stream;

        let captured = false;
        const onFrameReady = () => {
          if (captured) return;
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            setTimeout(onFrameReady, 50);
            return;
          }
          captured = true;

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          stream.getTracks().forEach(t => t.stop());
          video.remove();

          bannerText.textContent = 'Desktop Frozen · ' + canvas.width + '×' + canvas.height + 'px (' + screenSource.name + ')';

          // Reveal window now that the real desktop pixels are ready!
          ipcRenderer.send('capture-ready', { w: canvas.width, h: canvas.height });
        };

        video.onloadedmetadata = () => {
          video.play().then(onFrameReady).catch(() => setTimeout(onFrameReady, 100));
        };
        video.onloadeddata = onFrameReady;
        setTimeout(onFrameReady, 350);

      } catch (err) {
        bannerText.textContent = 'Capture Error: ' + err.message;
        ipcRenderer.send('capture-ready', { w: 0, h: 0 });
      }
    }

    initDesktopCapture();
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, htmlContent);
  win.loadFile(htmlPath);
});
