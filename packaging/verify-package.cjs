// Smoke-test the actual packaged executable using its loopback Node inspector.
// No captured pixels, API keys or user files are sent to any external service.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { listPackage } = require('@electron/asar');
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'release/win-unpacked');
const resources = path.join(root, 'resources');
const profile = path.join(repo, 'scratch/package-smoke');
const cwd = path.join(profile, 'cwd-outside-checkout');
fs.mkdirSync(cwd, { recursive: true });
const version = require('../package.json').version;
const report = { version, checks: [], rendererErrors: [] };
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), details });
  if (!passed) throw new Error(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Inspector request timed out: ' + method)); }, 45000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const response = await rpc('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}
async function renderer(expression) {
  return evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).webContents.executeJavaScript(${JSON.stringify(expression)})`);
}
(async () => {
  try {
    const files = listPackage(path.join(resources, 'app.asar')).map(file=>file.replace(/\\/g,'/'));
    check('No bundled .env files', !fs.existsSync(path.join(resources,'.env')) && !files.some(f=>/(^|[\\/])\.env(?:$|[.\\/])/.test(f)));
    check('Brand icon and JetBrains font bundled', files.some(f=>f.endsWith('/assets/icon.png')) && files.some(f=>/jetbrains/i.test(f)));
    check('Native window verifier bundled', fs.existsSync(path.join(resources,'native/list_windows.exe')));
    const env = { ...process.env, APPDATA:path.join(profile,'appdata'), PYTHONHOME:'', PYTHONPATH:'', PATH:[path.join(process.env.WINDIR,'System32'),path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0')].join(path.delimiter) };
    for (const key of Object.keys(env)) if (/^(?:ELECTRON_|VSCODE_|GEMINI_API_KEY$|VERIFY_PACKAGED$)/.test(key)) delete env[key];
    // Dedicated test port isolates the bundled worker from any dev service.
    worker = spawn(path.join(resources,'perception-service/runtime/python.exe'), ['-m','uvicorn','server:app','--host','127.0.0.1','--port','4201'], {cwd:path.join(resources,'perception-service'),env,windowsHide:true,stdio:'ignore'});
    worker.on('error', error => {report.workerError=error.message;});
    const health = await until(() => fetch('http://127.0.0.1:4201/health', {signal:AbortSignal.timeout(1000)}).then(r=>r.ok ? r.json() : null));
    check('Bundled perception works without system Python or development PATH', health.status==='ok', health);
    child = spawn(path.join(root,'Project Horizon.exe'), ['--inspect=127.0.0.1:9231','--disable-gpu','--user-data-dir='+path.join(profile,'userdata')], {cwd,env,stdio:'ignore',windowsHide:false});
    child.on('error', error => {report.appError=error.message;});
    const target = await until(() => fetch('http://127.0.0.1:9231/json/list').then(r=>r.json()).then(rows=>rows[0]));
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message', event=>{const response=JSON.parse(event.data);const item=pending.get(response.id);if(item){clearTimeout(item.timer);pending.delete(response.id);response.error?item.reject(new Error(response.error.message)):item.resolve(response.result);}});
    await until(() => renderer('Boolean(window.horizonAPI && document.querySelector(".horizon-app"))'));
    const identity = await evaluate(`({packaged:process.mainModule.require('electron').app.isPackaged,version:process.mainModule.require('electron').app.getVersion(),userdata:process.mainModule.require('electron').app.getPath('userData')})`);
    check('Actual packaged executable launches', identity.packaged && identity.version===version, identity);
    check('Verification uses an isolated profile', identity.userdata.toLowerCase().startsWith(profile.toLowerCase()+path.sep));
    check('Fresh install has no bundled Gemini credential', !(await renderer('window.horizonAPI.getGeminiStatus()')).configured);
    await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).webContents.on('console-message', (_e,level,message)=>{if(level===3)globalThis.__horizonSmokeErrors=(globalThis.__horizonSmokeErrors||[]).concat(message);})`);
    const ui = await renderer(`document.fonts.ready.then(()=>({font:[...document.fonts].some(f=>f.family.includes('JetBrains Mono')&&f.status==='loaded'),icon:document.querySelector('.brand-mark img').naturalWidth,consent:Boolean(document.querySelector('.consent-dialog')),noReadyBadge:!document.querySelector('.connection-pill')}))`);
    check('Packaged UI, consent, font and app icon load', ui.font && ui.icon===512 && ui.consent && ui.noReadyBadge, ui);
    check('Hotkey waits for consent', !(await evaluate(`process.mainModule.require('electron').globalShortcut.isRegistered('Super+Shift+C')`)));
    await renderer(`document.querySelector('.consent-secondary').click();document.querySelector('[aria-label="Preferences"]').click();`);
    await until(()=>renderer(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent==='Inference Engine'))`));
    await renderer(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Inference Engine').click()`);
    await until(()=>renderer(`Boolean(document.querySelector('#gemini-api-key'))`));
    check('Installer key setup is available', await renderer(`document.querySelector('#gemini-api-key').type==='password'`));
    fs.writeFileSync(path.join(profile,'preferences.png'), Buffer.from(await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>/index.html$/.test(w.webContents.getURL())).webContents.capturePage().then(image=>image.toPNG().toString('base64'))`),'base64'));
    const prompt='open my code security reviewer project in vs code';
    // Keep the editor's normal profile while Horizon retains its cached,
    // isolated userData path for this smoke test.
    await evaluate('process.env.APPDATA='+JSON.stringify(process.env.APPDATA));
    const result=await renderer('window.horizonAPI.executeTask('+JSON.stringify({prompt})+')');
    report.projectResult={status:result.status,narration:result.currentNarration,steps:result.steps};
    check('Installed app finds and opens the requested sibling project', result.status==='done' && result.steps.some(s=>s.toolName==='launch_app'&&s.status==='succeeded'));
    report.rendererErrors=await evaluate('globalThis.__horizonSmokeErrors||[]');
    check('No renderer errors',report.rendererErrors.length===0);
    report.passed=true;
  } catch(error) {report.error=error.stack;report.passed=false;}
  finally {
    for(const item of pending.values())clearTimeout(item.timer);
    socket?.close();child?.kill();worker?.kill();
    fs.writeFileSync(path.join(repo,'release/package-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:1;
  }
})();
