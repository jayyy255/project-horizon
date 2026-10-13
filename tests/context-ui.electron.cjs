// Native hosted workflow with synthetic answers; no cloud calls.
const { app, BrowserWindow, desktopCapturer, globalShortcut, dialog } = require('electron');
const fs = require('node:fs'), path = require('node:path');
app.disableHardwareAcceleration();
app.setPath('userData', path.resolve('scratch/context-ui-' + Date.now()));
const out = path.resolve('docs/verification/personal-2026-10-13', process.env.HORIZON_TEST_PACKAGE_ROOT ? 'packaged' : '.'); fs.mkdirSync(out, { recursive: true });
const report = { checks: [], fixtures: [], errors: [] }, callbacks = new Map();
const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (key, callback) => { callbacks.set(key, callback); return register(key, callback); };
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  if (!String(url).endsWith('/v1/answer')) {
    if (!/^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(String(url))) throw Error('External requests are disabled in the hosted UI test');
    return realFetch(url, options);
  }
  if (options.headers.Authorization || options.headers['x-goog-api-key']) throw Error('Unexpected client credential');
  const text = 'The launch date is October 20. The budget is 420 dollars.';
  return new Response([{ type: 'delta', text }, { type: 'done', text }].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
};
require(path.join(process.env.HORIZON_TEST_PACKAGE_ROOT || path.resolve('dist-electron'), 'electron/main.js'));
process.env.HORIZON_GEMINI_DIRECT = '0';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (win, code) => win.webContents.executeJavaScript(code);
async function until(fn, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { const result = await fn().catch(() => null); if (result) return result; await sleep(80); } throw new Error('Workflow check timed out'); }
const check = (name, passed, details) => { report.checks.push({ name, passed: Boolean(passed), details }); console.log(JSON.stringify(report.checks.at(-1))); if (!passed) throw new Error(name); };
const shot = async (win, name) => { await run(win, 'document.fonts.ready.then(()=>true)'); await sleep(150); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
function pdf(text) {
  const stream = `BT /F1 14 Tf 30 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = '%PDF-1.4\n', offsets = [0]; objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index+1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source); source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(source);
}
app.whenReady().then(async () => {
  try {
    const main = await until(async () => BrowserWindow.getAllWindows().find(win => /index.html$/.test(win.webContents.getURL())));
    const account = await run(main, 'window.horizonAPI.getGeminiStatus()');
    check('Fresh hosted profile needs no account and exposes no credentials', account.hosted && account.configured && !('idToken' in account) && !('refreshToken' in account));
    await until(() => run(main, 'Boolean(document.querySelector(".consent-secondary"))'));
    await run(main, 'document.querySelector(".consent-secondary").click()');
    await run(main, 'window.horizonAPI.approveHotkey()');
    await run(main, 'window.horizonAPI.toggleFloatingBar()');
    const bar = await until(async () => BrowserWindow.getAllWindows().find(win => /#bar$/.test(win.webContents.getURL())));
    await until(() => run(bar, 'Boolean(document.querySelector("textarea"))'));
    for (const win of BrowserWindow.getAllWindows()) win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
    const setInput = text => run(bar, `(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const send = async text => { await sleep(1550); await setInput(text); await sleep(50); await run(bar, 'document.querySelector("[aria-label=Generate]").click()'); return until(() => run(bar, 'document.querySelector(".floating-thinking")?null:document.querySelector(".floating-message.assistant:last-child>div")?.textContent'), 130000); };
    const reset = async () => { await run(bar, 'document.querySelector("[aria-label=\\\"New floating conversation\\\"]").click()'); await sleep(100); };
    const fixture = new BrowserWindow({ width: 1200, height: 750, show: false, webPreferences: { sandbox: true } });
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><style>body{font:32px system-ui;background:white;color:black;padding:45px}h1{color:#438bc4}section{margin-top:80px;border:1px solid #bbb;border-radius:18px;padding:28px}</style><h1>Horizon project plan</h1><p>Launch date: October 20</p><section>Budget: 420 dollars<br>Owner: Demo team</section></html>'));
    const bitmap = await fixture.webContents.capturePage(); fixture.destroy();
    desktopCapturer.getSources = async () => [{ id: 'screen:fixture', name: 'Generated project plan', thumbnail: bitmap }];
    await run(bar, 'document.querySelector("[aria-label=\\\"Full Screen\\\"]").click()'); await until(() => run(bar, 'Boolean(document.querySelector("img[alt=\\\"Crop preview\\\"]"))'));
    await send('What is the launch date?');
    check('Streamed screen answer appears with timing details', await run(bar, 'document.querySelector(".floating-message.assistant").textContent.includes("October 20")&&Boolean(document.querySelector(".timing-details"))'));
    await send('What is the budget in another part of the same image?');
    const active = await run(bar, 'JSON.parse(localStorage.getItem("horizon_chat_sessions"))[0]');
    check('Follow-up retains the identical original full-screen context', active.messages[0].attachments[0].croppedDataUrl === active.messages[2].attachments[0].croppedDataUrl);
    const status = await run(bar, 'window.horizonAPI.getHotkeyStatus()'); await sleep(150);
    check('Test shortcut is registered with Windows', status.active && globalShortcut.isRegistered(status.accelerator));
    callbacks.get(status.accelerator)();
    await until(() => run(bar, '!document.querySelector(".floating-message")'));
    check('Production shortcut callback starts a new visible empty chat after an answer', bar.isVisible() && !await run(bar, 'Boolean(document.querySelector("img[alt=\\\"Crop preview\\\"]"))'));
    check('Previous conversation remains in saved history', await run(bar, 'JSON.parse(localStorage.getItem("horizon_chat_sessions"))[0].messages.length===4'));
    const docFile = path.join(app.getPath('userData'), 'plan.pdf'); fs.writeFileSync(docFile, pdf('Launch date October 20. Budget 420 dollars.'));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [docFile] });
    await run(bar, 'document.querySelector("[aria-label=\\\"Attach file\\\"]").click()');
    await until(() => run(bar, 'document.body.textContent.includes("plan.pdf")'));
    await send('Summarize this PDF.');
    check('Real file picker path scans a PDF and shows an answer', await run(bar, 'Boolean(document.querySelector("[title*=\\\"Defender scan completed\\\"]"))&&!document.querySelector(".message-error")'));
    await run(bar, 'document.querySelector(".timing-details").open=true'); await shot(bar, 'pdf-answer-dark');
    await run(main, 'document.querySelector("[aria-label=\\\"Toggle Light / Dark Mode\\\"]").click()'); await until(() => run(bar, 'document.documentElement.classList.contains("light-mode")')); await shot(bar, 'pdf-answer-light');
    // Prepared image/document samples also stay mocked.
    for (const kind of ['text','fullscreen','crop','pdf','file']) {
      await reset();
      if (kind === 'fullscreen') { await run(bar, 'document.querySelector("[aria-label=\\\"Full Screen\\\"]").click()'); await until(() => run(bar, 'Boolean(document.querySelector("img[alt=\\\"Crop preview\\\"]"))')); }
      else if (kind === 'crop') {
        await run(bar, 'document.querySelector("[aria-label=\\\"Circle Area\\\"]").click()');
        const overlay = await until(async () => BrowserWindow.getAllWindows().find(win => /#capture$/.test(win.webContents.getURL()) && win.isVisible()));
        await until(() => run(overlay, 'Boolean(document.querySelector(".capture-desktop"))'));
        await run(overlay, 'document.querySelector(".capture-canvas").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,clientX:20,clientY:20}))');
        for (const [x,y] of [[700,20],[700,320],[20,320],[20,20]]) await run(overlay, `document.querySelector('.capture-canvas').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${x},clientY:${y}}))`);
        await run(overlay, 'document.querySelector(".capture-canvas").dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:0}))');
        await until(() => run(overlay, '!document.querySelector(".capture-primary").disabled')); await run(overlay, 'document.querySelector(".capture-primary").click()');
        await until(() => run(bar, 'Boolean(document.querySelector("img[alt=\\\"Crop preview\\\"]"))'));
      } else if (kind !== 'text') {
        const file = kind === 'pdf' ? docFile : path.join(app.getPath('userData'), 'plan.txt'); if (kind === 'file') fs.writeFileSync(file, 'Launch date October 20. Budget 420 dollars.');
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
        await run(bar, 'document.querySelector("[aria-label=\\\"Attach file\\\"]").click()'); await until(() => run(bar, `document.body.textContent.includes('plan.${kind === 'pdf' ? 'pdf' : 'txt'}')`));
      }
      const text = await send(kind === 'pdf' ? 'Read the launch date from this PDF page layout.' : 'What is the launch date?');
      check(kind + ' returns the hosted fixture answer', text.includes('October 20'));
      const session = await until(() => run(bar, '(()=>{const sessions=JSON.parse(localStorage.getItem("horizon_chat_sessions")); const current=sessions.find(s=>s.id===localStorage.getItem("horizon_active_session_id"));return current?.messages.at(-1)?.latency?current:null})()'));
      const message = session.messages.at(-1);
      const timing = await until(() => run(bar, `window.horizonAPI.getLatencyReport(${JSON.stringify(message.latency?.id)}).then(report=>report?.stages.some(stage=>stage.name==='answer_render')?report:null)`));
      check(kind + ' exposes step timings for this answer', timing && timing.source === kind);
      report.fixtures.push({ kind, status: message.status, answer: text, timing }); console.log(JSON.stringify(report.fixtures.at(-1)));
    await run(bar, 'document.querySelector(".timing-details").open=true'); await shot(bar, kind + '-fixture');
    }
    await run(main, 'document.querySelector("[aria-label=Preferences]").click()');
    await until(() => run(main, 'Boolean([...document.querySelectorAll("button")].find(button=>button.textContent==="Inference Engine"))'));
    await run(main, '[...document.querySelectorAll("button")].find(button=>button.textContent==="Inference Engine").click()');
    await until(() => run(main, 'document.body.textContent.includes("Horizon answers")'));
    check('Native preferences require no account or API-key form', await run(main, '!document.querySelector("#gemini-api-key")&&!document.body.textContent.includes("Sign in with Google")'));
    await shot(main, 'preferences-light');
    check('No account session is created in the fresh profile', !fs.existsSync(path.join(app.getPath('userData'), 'horizon-account.enc')));
    check('Native UI produced no renderer errors', report.errors.length === 0, report.errors);
    report.passed = true;
  } catch (error) { report.passed = false; report.error = error.stack; console.error(error.message); }
  finally { global.fetch = realFetch; fs.writeFileSync(path.join(out, 'native-ui.json'), JSON.stringify(report, null, 2)); process.exitCode = report.passed ? 0 : 1; app.quit(); }
});
