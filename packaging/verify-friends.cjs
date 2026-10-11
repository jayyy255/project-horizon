// Verifies the actual private friends build. Credentials are never logged.
// Live model tests contain synthetic text only; screenshots stay local.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { listPackage } = require('@electron/asar');
const repo = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const root = path.join(repo, 'release/win-unpacked');
const resources = path.join(root, 'resources');
const profile = path.join(repo, 'scratch/friends-smoke', String(Date.now()));
const cwd = path.join(profile, 'outside-checkout');
fs.mkdirSync(cwd, { recursive: true });
const report = { version, checks: [], rendererErrors: [] };
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), details });
  console.log(JSON.stringify(report.checks.at(-1)));
  if (!passed) throw new Error(name);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await fn().catch(() => null); if (value) return value; await sleep(250); }
  throw new Error('Verification timed out');
}
let child, worker, socket, next = 0;
const pending = new Map();
function rpc(method, params = {}) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Inspector request timed out')); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function renderer(expression, bar = false) {
  return evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>${bar ? '/#bar$/' : '/index.html$/'} .test(w.webContents.getURL())).webContents.executeJavaScript(${JSON.stringify(expression)})`);
}
const env = { ...process.env, PYTHONHOME: '', PYTHONPATH: '', PATH: [path.join(process.env.WINDIR, 'System32'), path.join(process.env.WINDIR, 'System32/WindowsPowerShell/v1.0')].join(path.delimiter) };
for (const key of Object.keys(env)) if (/^(?:ELECTRON_|VSCODE_|GEMINI_API_KEY$|VERIFY_PACKAGED$)/.test(key)) delete env[key];
async function launch() {
  child = spawn(path.join(root, 'Project Horizon.exe'), ['--inspect=127.0.0.1:9232', '--disable-gpu', '--user-data-dir=' + path.join(profile, 'userdata')], { cwd, env, stdio: 'ignore', windowsHide: false });
  child.on('error', error => { report.appError = error.message; });
  const target = await until(() => fetch('http://127.0.0.1:9232/json/list').then(response => response.json()).then(rows => rows[0]));
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const response = JSON.parse(event.data), item = pending.get(response.id); if (item) { clearTimeout(item.timer); pending.delete(response.id); response.error ? item.reject(new Error(response.error.message)) : item.resolve(response.result); } });
  await until(() => renderer('Boolean(window.horizonAPI && document.querySelector(".horizon-app"))'));
  await evaluate(`(()=>{global.__testModelRequests=[];const request=global.fetch;global.fetch=async(...args)=>{const url=String(args[0]);if(!url.includes('generativelanguage.googleapis.com'))return request(...args);const item={model:new URL(url).pathname.split('/').at(-1)};global.__testModelRequests.push(item);try{const response=await request(...args);item.status=response.status;if(response.headers.get('content-type')?.includes('text/event-stream'))return response;const data=await response.clone().json().catch(()=>({}));item.providerCode=data.error?.code;item.providerStatus=data.error?.status;item.finishReason=data.candidates?.[0]?.finishReason;return response;}catch(error){item.failure=error.name;item.code=error.cause?.code;throw error;}};return true;})()`);
}
async function stopApp() {
  if (socket) { await evaluate(`setTimeout(()=>process.mainModule.require('electron').app.quit(),50);true` ).catch(() => {}); socket.close(); socket = null; }
  await until(async () => child.exitCode !== null, 10000); child = null;
  await sleep(500);
}
async function send(prompt) {
  await renderer(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(prompt)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`, true);
  await sleep(100);
  await renderer(`document.querySelector('[aria-label="Generate"]').click()`, true);
  return until(() => renderer(`(()=>{if(document.querySelector('.floating-thinking'))return null;return [...document.querySelectorAll('.floating-message.assistant>div')].at(-1)?.textContent})()`, true), 130000);
}
(async () => {
  try {
    const files = listPackage(path.join(resources, 'app.asar')).map(file => file.replace(/\\/g, '/'));
    check('No bundled .env files or key in app.asar', !fs.existsSync(path.join(resources, '.env')) && !files.some(file => /(^|\/)\.env(?:$|\.)|owner-gemini/.test(file)));
    check('Explicit owner access file exists only in ignored resources', fs.existsSync(path.join(resources, 'app-access/owner-gemini.json')));
    worker = spawn(path.join(resources, 'perception-service/runtime/python.exe'), ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '4201'], { cwd: path.join(resources, 'perception-service'), env, stdio: 'ignore', windowsHide: true });
    worker.on('error', error => { report.workerError = error.message; });
    const health = await until(() => fetch('http://127.0.0.1:4201/health', { signal: AbortSignal.timeout(1000) }).then(response => response.ok ? response.json() : null));
    check('Portable perception starts without host Python', health.status === 'ok');
    await launch();
    const identity = await evaluate(`({packaged:process.mainModule.require('electron').app.isPackaged,version:process.mainModule.require('electron').app.getVersion(),userdata:process.mainModule.require('electron').app.getPath('userData')})`);
    check('Correct packaged version launches in an isolated profile', identity.packaged && identity.version === version && identity.userdata.startsWith(profile));
    const access = await renderer('window.horizonAPI.getGeminiStatus()');
    check('Fresh profile receives owner access without revealing the key', access.configured && access.ownerProvided && Object.keys(access).sort().join(',') === 'configured,ownerProvided');
    const initial = await renderer('window.horizonAPI.getHotkeyStatus()');
    check('Shortcut stays disabled before approval', !initial.approved && !initial.active);
    check('New profiles use Ctrl + Alt + H', initial.accelerator === 'CommandOrControl+Alt+H');
    await evaluate(`(()=>{const registry=process.mainModule.require('electron').globalShortcut;const register=registry.register.bind(registry);registry.register=(key,callback)=>key==='Super+Shift+C'?false:register(key,callback);return true;})()`);
    const preferred = await renderer(`window.horizonAPI.approveHotkey('Super+Shift+C')`);
    check('Unavailable Win shortcut is truthfully inactive', !preferred.success && !preferred.active && Boolean(preferred.error));
    const recovered = await renderer('window.horizonAPI.approveHotkey()');
    check('Enable recovers to a real registered alternative with a notice', recovered.success && recovered.active && recovered.accelerator === 'CommandOrControl+Alt+H' && Boolean(recovered.notice));
    const alternate = await renderer(`window.horizonAPI.approveHotkey('CommandOrControl+Alt+H')`);
    check('Alternative shortcut registers across Windows', alternate.success && alternate.active);
    check('Changing shortcut releases previous registration', !(await evaluate(`process.mainModule.require('electron').globalShortcut.isRegistered('Super+Shift+C')`)));
    await stopApp(); await launch();
    const restored = await renderer('window.horizonAPI.getHotkeyStatus()');
    check('Shortcut restores on restart from native settings', restored.active && restored.accelerator === 'CommandOrControl+Alt+H');
    check('Restart does not ask for consent or a Gemini key again', !(await renderer(`Boolean(document.querySelector('.consent-dialog'))`)));
    await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).close()`);
    check('Closing workspace leaves shortcut active in the tray', !(await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).isVisible()`)) && (await renderer('window.horizonAPI.getHotkeyStatus()')).active);
    const duplicate = spawn(path.join(root, 'Project Horizon.exe'), ['--user-data-dir=' + path.join(profile, 'userdata')], { cwd, env, stdio: 'ignore', windowsHide: false });
    duplicate.on('error', error => { report.duplicateError = error.message; });
    await until(async () => duplicate.exitCode !== null, 15000);
    check('Second instance exits and brings existing workspace forward', duplicate.exitCode === 0 && await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).isVisible()`));
    await renderer(`document.querySelector('[aria-label="Preferences"]').click()`);
    await sleep(200);
    await renderer(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Inference Engine').click()`);
    await until(() => renderer(`document.body.textContent.includes('Gemini access included')`));
    check('Preferences show included access without API-key setup', !(await renderer(`Boolean(document.querySelector('#gemini-api-key'))`)));
    await renderer('window.horizonAPI.toggleFloatingBar()');
    await until(() => renderer(`Boolean(document.querySelector('.floating-panel'))`, true));
    const result = await send('What is 2 + 2? Reply with the number only and do not use any desktop tools.');
    const liveTextAnswer = /\b4\b|four/i.test(result);
    report.liveProvider = { textAnswer: liveTextAnswer, textResult: result };
    if (liveTextAnswer) check('Live Gemini answer appears inside the floating bar', true, { answer: result });
    else {
      check('Packaged bar reports a real Gemini service failure without blaming the key', /Gemini (?:is temporarily busy|took too long|returned no completed answer)|Could not connect to Gemini/.test(result) && !/configuration|Ollama/.test(result), { answer: result });
      await evaluate(`(()=>{global.__testRealFetch=global.fetch;global.__testFixtureHistory=false;global.fetch=async(url,options)=>{if(String(url).includes('generativelanguage.googleapis.com')){const body=JSON.parse(options.body);const requestText=body.contents?.[0]?.parts?.[0]?.text||"";if(requestText.includes('What result did you just give'))global.__testFixtureHistory=requestText.includes('Earlier conversation')&&requestText.includes('assistant')&&requestText.includes('"text":"4"');return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({final_answer:'4'})}]}}]}),{status:200});}return global.__testRealFetch(url,options)};return true})()`);
      await renderer(`document.querySelector('[aria-label="New floating conversation"]').click()`, true);
      const fixtureAnswer = await send('What is 2 + 2? Reply with the number only and do not use any desktop tools.');
      check('Packaged text response pipeline works with a controlled provider response', /\b4\b|four/i.test(fixtureAnswer));
    }
    await sleep(1600);
    const followup = await send('What result did you just give me? Reply with the number only and do not use any desktop tools.');
    check('Floating follow-up preserves context', /\b4\b|four/i.test(followup) && (liveTextAnswer || await evaluate('global.__testFixtureHistory===true')), { answer: followup, provider: liveTextAnswer ? 'live' : 'controlled' });
    const history = await renderer(`JSON.parse(localStorage.getItem('horizon_chat_sessions')).find(s=>s.id===localStorage.getItem('horizon_active_session_id')).messages`, true);
    check('Both questions share one persisted conversation', history.length === 4);
    const bounds = await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).getBounds()`);
    check('Floating window grows to fit answers', bounds.height > 176 && bounds.height <= 560, bounds);
    fs.writeFileSync(path.join(profile, 'floating-answers.png'), Buffer.from(await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).webContents.capturePage().then(image=>image.toPNG().toString('base64'))`), 'base64'));
    check('Floating shell is transparent with no nested prompt frame', await renderer(`getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('.prompt-surface')).borderTopWidth==='0px'`, true));
    check('Packaged native floating corners have zero alpha', await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).webContents.capturePage().then(image=>image.toBitmap()[3]===0)`));
    const toggleTheme = `[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Toggle Light / Dark Mode').click()`;
    await renderer(toggleTheme);
    await until(() => renderer(`document.documentElement.classList.contains('light-mode')`, true));
    check('Packaged floating assistant follows white light theme live', await renderer(`document.querySelector('.floating-bar').classList.contains('light-mode')&&getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim()==='#ffffff'`, true));
    fs.writeFileSync(path.join(profile, 'floating-answers-light.png'), Buffer.from(await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).webContents.capturePage().then(image=>image.toPNG().toString('base64'))`), 'base64'));
    await renderer(toggleTheme);
    await until(() => renderer(`document.documentElement.classList.contains('dark')`, true));
    check('Packaged floating assistant returns to black dark theme live', await renderer(`!document.querySelector('.floating-bar').classList.contains('light-mode')&&getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim()==='#080808'`, true));
    // Exercise real capture IPC with a synthetic image, without collecting the user's desktop.
    const pixel = 'data:image/png;base64,' + fs.readFileSync(path.join(repo, 'packaging/fixtures/synthetic-repository.png')).toString('base64');
    await evaluate(`process.mainModule.require('electron').desktopCapturer.getSources=async()=>{const electron=process.mainModule.require('electron');global.__barHiddenDuringCapture=!electron.BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).isVisible();return [{id:'screen:synthetic',name:'Synthetic repository screen',thumbnail:electron.nativeImage.createFromDataURL(${JSON.stringify(pixel)})}]};true`);
    check('Floating bar offers direct context choices', await renderer(`Boolean(document.querySelector('[aria-label="Circle Area"]')&&document.querySelector('[aria-label="Full Screen"]'))`, true));
    await renderer(`document.querySelector('[aria-label="Full Screen"]').click()`, true);
    await until(() => renderer(`Boolean(document.querySelector('img[alt="Crop preview"]'))`, true));
    check('Full-screen capture hides Horizon before reading the screen', await evaluate('global.__barHiddenDuringCapture===true'));
    if (!liveTextAnswer) await evaluate('global.fetch=global.__testRealFetch;true');
    const imageStart = performance.now();
    const imageAnswer = await send('What is this?');
    const imageLatency = Math.round(performance.now() - imageStart);
    const liveImageAnswer = /github|repository/i.test(imageAnswer) && !(await renderer(`Boolean(document.querySelector('.message-error'))`, true));
    report.liveProvider.imageAnswer = liveImageAnswer;
    check(liveImageAnswer ? 'Packaged image question returns a real streamed answer' : 'Packaged image question reports a timed-out or unavailable provider', liveImageAnswer || /Gemini|connection|request limit/i.test(imageAnswer), { elapsedMs: imageLatency, answer: imageAnswer });
    check('Packaged attachment answer exposes local timing details', await renderer('Boolean(document.querySelector(".timing-details"))', true));
    await renderer('window.horizonAPI.toggleFloatingBar()', true);
    await until(() => renderer('!document.querySelector(".floating-message")&&!document.querySelector("img[alt=\\"Crop preview\\"]")', true));
    check('Summon after a completed answer resets the packaged bar and preserves history', await renderer('JSON.parse(localStorage.getItem("horizon_chat_sessions")).some(session=>session.messages.length>0)', true));
    const harmless = path.join(profile, 'harmless-plan.txt'); fs.writeFileSync(harmless, 'Launch date October 20. Budget 420 dollars.');
    await evaluate(`process.mainModule.require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(harmless)}]});true`);
    await renderer('document.querySelector("[aria-label=\\"Attach file\\"]").click()', true);
    await until(() => renderer('document.body.textContent.includes("harmless-plan.txt")', true));
    check('Packaged file picker accepts a document only after real Defender scanning', await renderer('Boolean(document.querySelector("[title*=\\"Defender scan completed\\"]"))', true));
    await renderer(`document.querySelector('[aria-label="Full Screen"]').click()`, true);
    await until(() => renderer(`Boolean(document.querySelector('img[alt="Crop preview"]'))`, true));
    const overlay = expression => evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#capture$/.test(w.webContents.getURL())).webContents.executeJavaScript(${JSON.stringify(expression)})`);
    await renderer('window.__testCaptureCount=0;window.horizonAPI.onAreaAttached(()=>window.__testCaptureCount++);true');
    await renderer('window.horizonAPI.triggerCapture()', true);
    await until(() => overlay(`Boolean(document.querySelector('.capture-desktop'))`));
    check('Packaged capture uses the Horizon logo and JetBrains Mono', await overlay(`Boolean(document.querySelector('.capture-brand .horizon-icon'))&&getComputedStyle(document.querySelector('.capture-shell')).fontFamily.includes('JetBrains Mono')`));
    await overlay(`document.querySelector('.capture-canvas').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:120,clientY:160}))`);
    for (const [x,y] of [[600,160],[600,450],[120,450],[120,160]]) await overlay(`document.querySelector('.capture-canvas').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${x},clientY:${y}}))`);
    await overlay(`document.querySelector('.capture-canvas').dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}))`);
    await until(() => overlay(`!document.querySelector('.capture-primary').disabled`));
    const previousPreviews = await renderer(`document.querySelectorAll('img[alt="Crop preview"]').length`, true);
    await overlay(`document.querySelector('.capture-primary').click()`);
    await until(() => renderer(`document.querySelectorAll('img[alt="Crop preview"]').length===${previousPreviews + 1}`, true));
    check('Circle selection returns to the floating bar while workspace is open', await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).isVisible()`) && (await renderer('window.__testCaptureCount')) === 0);
    await renderer('window.horizonAPI.triggerCapture()', true);
    await until(() => overlay(`!document.querySelector('.capture-selection path')&&document.querySelector('.capture-primary').disabled`));
    check('A new capture starts with no stale circle', await overlay(`!document.querySelector('.capture-selection path')`));
    await overlay('window.horizonAPI.closeOverlay()');
    check('Cancelling circle selection restores the floating bar', await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/#bar$/.test(w.webContents.getURL())).isVisible()`));
    const previousChat = await renderer('localStorage.getItem("horizon_active_session_id")');
    const sessionCount = await renderer('JSON.parse(localStorage.getItem("horizon_chat_sessions")).length');
    await renderer(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Explain this selection');input.dispatchEvent(new Event('input',{bubbles:true}));})()`, true);
    await sleep(100);
    await renderer(`document.querySelector('[aria-label="Open workspace"]').click()`, true);
    await until(() => renderer(`localStorage.getItem('horizon_active_session_id')!==${JSON.stringify(previousChat)}`));
    check('Packaged Open workspace starts a fresh chat and retains previous conversations', await renderer(`(()=>{const sessions=JSON.parse(localStorage.getItem('horizon_chat_sessions'));return sessions.length===${sessionCount + 1}&&sessions.find(s=>s.id===localStorage.getItem('horizon_active_session_id')).messages.length===0&&document.querySelector('textarea').value==='Explain this selection'&&Boolean(document.querySelector('img[alt="Crop preview"]'))})()`));
    const session = { profile, inspector: 'http://127.0.0.1:9232', pid: child.pid, stopFile: path.join(profile, 'finish.json') };
    fs.writeFileSync(path.join(repo, 'release/friends-verification-session.json'), JSON.stringify(session));
    if (process.argv.includes('--keep-open')) {
      console.log('Ready for physical keyboard verification.');
      await until(async () => fs.existsSync(session.stopFile), 1200000);
      const extra = JSON.parse(fs.readFileSync(session.stopFile, 'utf8'));
      for (const item of extra.checks || []) check(item.name, item.passed, item.details);
    }
    report.passed = true;
  } catch (error) { report.error = error.stack; report.passed = false; }
  finally {
    if (socket) report.modelRequests = await evaluate('global.__testModelRequests || []').catch(() => []);
    if (child && socket) await stopApp().catch(() => child?.kill());
    for (const item of pending.values()) clearTimeout(item.timer);
    socket?.close(); child?.kill(); worker?.kill();
    fs.writeFileSync(path.join(repo, 'release/package-verification-friends.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, error: report.error }));
    process.exitCode = report.passed ? 0 : 1;
  }
})();
