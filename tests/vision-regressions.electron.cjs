const { app, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', path.resolve('scratch/vision-regressions-' + Date.now()));
app.whenReady().then(async () => {
  const { answerImageQuestion, imagePart, isImageQuestion, VISION_DEADLINE_MS } = require('../dist-electron/electron/agent/vision');
  const { RequestLimiter } = require('../dist-electron/electron/agent/rateLimit');
  const image = nativeImage.createFromBitmap(Buffer.alloc(16, 255), { width: 2, height: 2 }).toDataURL();
  let serial = 0; const reports = [];
  const limiter = () => new RequestLimiter(path.join(app.getPath('userData'), 'usage-' + (++serial) + '.json'));
  const oldKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'synthetic-test-key';
  async function test(name, fn) { try { await fn(); reports.push({ name, passed: true }); } catch (error) { reports.push({ name, passed: false, error: error.message }); } console.log(JSON.stringify(reports.at(-1))); }
  await test('Image questions take the direct path; explicit desktop commands retain the safety-gated agent', () => {
    for (const prompt of ['what is this?', 'explain this GitHub repo', 'how do I open this project?']) assert.equal(isImageQuestion(prompt, [image]), true);
    for (const prompt of ['open this repository in VS Code', 'please click the button', 'delete this folder']) assert.equal(isImageQuestion(prompt, [image]), false);
    assert.equal(isImageQuestion('what is this?', []), false);
  });
  await test('Image MIME types are preserved and malformed data is rejected', () => { assert.equal(imagePart(image).inlineData.mimeType, 'image/png'); assert.throws(() => imagePart('garbage'), /invalid/); });
  await test('Plain-text multimodal answer ignores thought parts, uses history and sends no tool planner', async () => {
    let body;
    const result = await answerImageQuestion('what is this?', [image], [{ role: 'user', text: 'A repo page' }], limiter(), async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'A GitHub repository page.' }] } }] }));
    });
    assert.equal(result.finalAnswer, 'A GitHub repository page.');
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(body.contents[0].parts.at(-1).text, /A repo page/);
    assert.equal(body.generationConfig.responseMimeType, undefined);
    assert.ok(body.generationConfig.maxOutputTokens <= 768);
  });
  for (const [status, message] of [[429, /quota or rate limit/], [403, /refused/], [404, /model.*unavailable/], [503, /HTTP 503/]]) await test('HTTP ' + status + ' returns an actionable error without exposing provider data', async () => {
    const result = await answerImageQuestion('what is this?', [image], [], limiter(), async () => new Response('PRIVATE PROVIDER DATA', { status }));
    assert.match(result.error, message); assert.doesNotMatch(result.error, /PRIVATE/);
  });
  await test('Empty or safety-blocked responses do not become fake success', async () => {
    const result = await answerImageQuestion('what is this?', [image], [], limiter(), async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    assert.match(result.error, /declined/); assert.equal(result.finalAnswer, undefined);
  });
  await test('A temporary Gemini failure retries one fast cloud model inside the shared deadline', async () => {
    const calls = [];
    const result = await answerImageQuestion('what is this?', [image], [], limiter(), async (url, options) => {
      calls.push({ url: String(url), signal: options.signal });
      return calls.length === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A repository page.' }] } }] }));
    });
    assert.equal(result.finalAnswer, 'A repository page.'); assert.equal(calls.length, 2);
    assert.match(calls[1].url, /gemini-3.5-flash-lite:generateContent/); assert.equal(calls[0].signal, calls[1].signal);
  });
  await test('Local limits prevent an outbound image request', async () => {
    const limited = new RequestLimiter(path.join(app.getPath('userData'), 'limited.json'), 1, 100); limited.take(); let called = false;
    const result = await answerImageQuestion('what is this?', [image], [], limited, async () => { called = true; });
    assert.equal(called, false); assert.match(result.error, /limit/);
  });
  await test('Slow provider aborts within seven seconds without slow OCR or Ollama retries', async () => {
    const start = performance.now(); let calls = 0;
    const result = await answerImageQuestion('what is this?', [image], [], limiter(), async (_url, options) => {
      calls++; return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    });
    const elapsed = performance.now() - start; assert.equal(calls, 1); assert.match(result.error, /7 seconds/); assert.ok(elapsed >= VISION_DEADLINE_MS - 100 && elapsed < 7000, String(elapsed));
  });
  await test('Coordinator answers images without waiting for perception or parsing planner JSON', async () => {
    const { AgentCoordinator } = require('../dist-electron/electron/agent/coordinator');
    const { SafetyGate } = require('../dist-electron/electron/agent/gate');
    const { ProjectIndexer } = require('../dist-electron/electron/agent/indexer');
    const { InputSynthesizer } = require('../dist-electron/electron/agent/synthesizer');
    const { AuditDatabase } = require('../dist-electron/electron/agent/db');
    const audit = new AuditDatabase(':memory:'), indexer = new ProjectIndexer(':memory:');
    const coordinator = new AgentCoordinator(new SafetyGate(), indexer, new InputSynthesizer(), audit);
    const original = global.fetch; let calls = 0;
    global.fetch = async url => { assert.match(String(url), /generativelanguage.googleapis.com/); calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A GitHub repository.' }] } }] })); };
    try { const result = await coordinator.executeTask('vision-1', 'what is this?', undefined, [image]); assert.equal(result.status, 'done'); assert.equal(result.currentNarration, 'A GitHub repository.'); assert.equal(result.steps.length, 0); assert.equal(calls, 1); }
    finally { global.fetch = original; coordinator.getSystemGraph().close(); coordinator.getCommandCache().close(); audit.close(); indexer.close(); }
  });
  await test('Ordinary questions recover from HTTP 503 using a fast cloud fallback instead of blaming the key', async () => {
    const { AgentCoordinator } = require('../dist-electron/electron/agent/coordinator');
    const { SafetyGate } = require('../dist-electron/electron/agent/gate');
    const { ProjectIndexer } = require('../dist-electron/electron/agent/indexer');
    const { InputSynthesizer } = require('../dist-electron/electron/agent/synthesizer');
    const { AuditDatabase } = require('../dist-electron/electron/agent/db');
    const audit = new AuditDatabase(':memory:'), indexer = new ProjectIndexer(':memory:');
    const coordinator = new AgentCoordinator(new SafetyGate(), indexer, new InputSynthesizer(), audit);
    const original = global.fetch; const calls = [];
    global.fetch = async url => { calls.push(String(url)); return calls.length === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"final_answer":"4"}' }] } }] })); };
    try { const result = await coordinator.executeTask('question-503', 'What is 2 + 2?'); assert.equal(result.status, 'done'); assert.equal(result.currentNarration, '4'); assert.equal(calls.length, 2); assert.match(calls[1], /gemini-3.1-flash-lite:generateContent/); }
    finally { global.fetch = original; coordinator.getSystemGraph().close(); coordinator.getCommandCache().close(); audit.close(); indexer.close(); }
  });
  if (oldKey) process.env.GEMINI_API_KEY = oldKey; else delete process.env.GEMINI_API_KEY;
  fs.mkdirSync('docs/verification/vision-1.1.3', { recursive: true });
  fs.writeFileSync('docs/verification/vision-1.1.3/regressions.json', JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ passed: reports.filter(item => item.passed).length, total: reports.length }));
  app.exit(reports.some(item => !item.passed) ? 1 : 0);
});
