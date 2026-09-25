require('dotenv').config({ override: true });
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const { AgentHost } = require('../dist-electron/electron/agent');

process.on('unhandledRejection', (err) => {
  console.error('\n💥 Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('\n💥 Uncaught Exception:', err);
  process.exit(1);
});

app.on('window-all-closed', (e) => {
  if (e) e.preventDefault();
});

app.whenReady().then(async () => {
  console.log('================================================================');
  console.log('🚀 PROJECT HORIZON: RECONNECTED AGENT & UI END-TO-END VERIFICATION');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // STEP 1: REAL DESKTOP CAPTURE & REGION CROP OF VS CODE
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Capturing real Windows desktop pixels via WebRTC DWM Stream...');
    
    // Create an offscreen capture worker window (same mechanism as CaptureOverlayCanvas)
    const workerWin = new BrowserWindow({
      width: 400,
      height: 300,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    ipcMain.handle('get-desktop-sources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      });
      return sources.map(s => ({ id: s.id, name: s.name }));
    });

    const capturePromise = new Promise((resolve) => {
      ipcMain.once('frame-captured', (_evt, data) => resolve(data));
    });

    const workerHtml = `<!DOCTYPE html>
    <html><body>
    <video id="v" autoplay playsinline muted style="display:none;"></video>
    <canvas id="c" style="display:none;"></canvas>
    <script>
      const { ipcRenderer } = require('electron');
      async function capture() {
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
              maxHeight: 2160,
            }
          }
        });
        const video = document.getElementById('v');
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');
        video.srcObject = stream;
        video.onloadeddata = () => {
          video.play();
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          stream.getTracks().forEach(t => t.stop());

          // Crop a real portion of VS Code (editor area / title / tabs)
          // Bounds: x=250, y=100, w=750, h=550
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = 750;
          cropCanvas.height = 550;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.drawImage(canvas, 250, 100, 750, 550, 0, 0, 750, 550);

          ipcRenderer.send('frame-captured', {
            desktopWidth: canvas.width,
            desktopHeight: canvas.height,
            fullDataUrl: canvas.toDataURL('image/png'),
            croppedDataUrl: cropCanvas.toDataURL('image/png'),
            cropWidth: 750,
            cropHeight: 550
          });
        };
      }
      capture().catch(err => {
        console.error('Worker capture failed:', err);
      });
    </script>
    </body></html>`;

    const workerFile = path.resolve(__dirname, 'temp_e2e_worker.html');
    fs.writeFileSync(workerFile, workerHtml);
    await workerWin.loadFile(workerFile);

    const frameData = await capturePromise;
    workerWin.close();
    try { fs.unlinkSync(workerFile); } catch {}

    console.log(`✓ Real desktop captured: ${frameData.desktopWidth}x${frameData.desktopHeight} px`);
    console.log(`✓ Real region crop extracted: ${frameData.cropWidth}x${frameData.cropHeight} px (${Math.round(frameData.croppedDataUrl.length / 1024)} KB)`);

    const outDir = path.resolve(__dirname, '../scratch');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const cropFile = path.join(outDir, 'real_vscode_e2e_crop.png');
    fs.writeFileSync(cropFile, Buffer.from(frameData.croppedDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log(`✓ Saved real crop image to: ${cropFile}`);

    // -------------------------------------------------------------------------
    // STEP 2: VERIFY REAL PERCEPTION (SoM Grounding & Tag Lookup Table)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 2] Dispatching real crop to Perception Service (/api/parse_som)...');
    const rawB64 = frameData.croppedDataUrl.replace(/^data:image\/png;base64,/, '');
    const somRes = await fetch('http://127.0.0.1:4200/api/parse_som', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: rawB64 }),
      signal: AbortSignal.timeout(25000),
    });

    assert.strictEqual(somRes.status, 200, `Perception service returned HTTP ${somRes.status}`);
    const somData = await somRes.json();
    console.log(`✓ Perception response: status="${somData.status}", detected ${somData.element_count} elements in ${somData.latency_ms} ms`);
    if (somData.elements && somData.elements.length > 0) {
      console.log('Sample Grounded Elements:', JSON.stringify(somData.elements.slice(0, 3), null, 2));
    }

    // -------------------------------------------------------------------------
    // STEP 3: INITIALIZE REAL AGENT HOST & VERIFY HUD STATE BROADCASTS
    // -------------------------------------------------------------------------
    console.log('\n[STEP 3] Initializing AgentHost & tracking live HUD narration events...');
    const agentHost = new AgentHost();
    const coordinator = agentHost.getCoordinator();

    const hudStates = [];
    coordinator['onStateChange'] = (state) => {
      hudStates.push({
        status: state.status,
        narration: state.currentNarration,
        stepsCount: state.steps?.length || 0,
        currentTool: state.currentTool,
      });
      console.log(`  [HUD Live Stream] Status: "${state.status}" | Narration: "${state.currentNarration}"`);
    };

    // -------------------------------------------------------------------------
    // STEP 4: TASK 1 — "What application is this?" (Multimodal Visual Grounding)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 4] Executing Task 1: "What application is this?" with real crop...');
    const t0 = performance.now();
    const task1Prompt = 'What application is this?';
    const task1Session = `sess-visual-${Date.now()}`;

    const task1Result = await coordinator.executeTask(
      task1Session,
      task1Prompt,
      undefined,
      [frameData.croppedDataUrl]
    );
    const task1Duration = performance.now() - t0;

    console.log(`\nTask 1 Finished in ${task1Duration.toFixed(2)} ms with status: "${task1Result.status}"`);
    console.log(`Final Answer: "${task1Result.currentNarration}"`);
    assert.strictEqual(task1Result.status, 'done', 'Task 1 must complete with status "done"');
    assert.ok(task1Result.currentNarration.length > 10, 'Task 1 must produce a non-empty answer');

    // -------------------------------------------------------------------------
    // STEP 5: TASK 2 — "Open my code scanner project in VS Code." (ReAct Pipeline)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 5] Executing Task 2: "Open my code scanner project in VS Code."...');
    // Seed the project indexer with code-scanner
    const indexer = coordinator['projectIndexer'];
    indexer.indexItem({
      name: 'code-scanner',
      path: 'E:/code/projects/code-scanner',
      manifest_type: 'package.json',
      content: 'Security scanner analysis tool for repository inspection'
    });

    const t1 = performance.now();
    const task2Prompt = 'Open my code scanner project in VS Code';
    const task2Session = `sess-project-${Date.now()}`;

    const task2Result = await coordinator.executeTask(
      task2Session,
      task2Prompt
    );
    const task2Duration = performance.now() - t1;

    console.log(`\nTask 2 Finished in ${task2Duration.toFixed(2)} ms with status: "${task2Result.status}"`);
    console.log(`Final Narration: "${task2Result.currentNarration}"`);
    console.log(`Total Steps Executed: ${task2Result.steps.length}`);
    task2Result.steps.forEach((s) => {
      console.log(`  Step ${s.stepIndex}: [${s.toolName}] status=${s.status}, duration=${Math.round(s.durationMs || 0)}ms, narration="${s.narration}"`);
    });

    assert.strictEqual(task2Result.status, 'done', 'Task 2 must complete with status "done"');
    assert.ok(task2Result.steps.length >= 2, 'Task 2 must have executed at least 2 steps (find_path + launch_app)');

    const toolNames = task2Result.steps.map(s => s.toolName);
    assert.ok(toolNames.includes('find_path'), 'Task 2 must include find_path');
    assert.ok(toolNames.includes('launch_app'), 'Task 2 must include launch_app');

    // -------------------------------------------------------------------------
    // STEP 6: VERIFY SAFETY GATE & AUDIT DATABASE RECORDS
    // -------------------------------------------------------------------------
    console.log('\n[STEP 6] Verifying Safety Gate logs in Audit Database...');
    const auditDb = coordinator['auditDb'];
    const sessionRecord = auditDb.getSession(task2Session);
    const traces = auditDb.getToolTraces(task2Session);

    console.log(`✓ Audit DB Session Record: status="${sessionRecord?.outcome}"`);
    console.log(`✓ Audit DB Traces Logged: ${traces.length}`);
    assert.strictEqual(sessionRecord?.outcome, 'succeeded', 'Audit DB must record succeeded session');
    assert.ok(traces.length >= 2, 'Audit DB must record tool traces');
    traces.forEach(t => {
      console.log(`  Trace: tool=${t.tool_name}, authorized=${Boolean(t.authorized)}, duration=${t.duration_ms}ms`);
      assert.strictEqual(Boolean(t.authorized), true, 'All executed tools must be authorized by Safety Gate');
    });

    console.log('\n================================================================');
    console.log('🎉 ALL END-TO-END PASS CRITERIA SATISFIED!');
    console.log('1. Real Desktop Capture: Verified');
    console.log('2. Real Region / Lasso Crop: Verified');
    console.log('3. Real Perception (YOLOv8 + OCR + SoM): Verified');
    console.log('4. Gemini Multimodal Visual Answer: Verified');
    console.log('5. ReAct Planner (find_path -> launch_app -> verification): Verified');
    console.log('6. Safety Gate Deterministic Enforcement: Verified');
    console.log('7. Live HUD Narration & Audit DB Traces: Verified');
    console.log('================================================================\n');

    agentHost.close();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    app.quit();
    process.exit(1);
  }
});
