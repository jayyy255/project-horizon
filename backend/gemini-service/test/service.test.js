import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { loadConfig } from '../src/config.js';
import { FirestoreQuota, DAY_MS } from '../src/quota.js';
import { validateQuestion, MAX_BODY_BYTES } from '../src/validation.js';
import { modelBody, streamAnswer } from '../src/gemini.js';
import { createService } from '../src/server.js';
import { ServiceError } from '../src/errors.js';

const config = () => loadConfig({ GEMINI_API_KEY: 'synthetic-provider-key' });
const question = validateQuestion({ prompt: 'What is the launch date?', parts: [{ text: 'Launch: October 20.' }] });
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const answer = text => ({ candidates: [{ content: { parts: [{ text }] } }] });
const noQuota = { reserve: async () => async () => {} };
const run = options => streamAnswer({ question, config: config(), quota: noQuota, signal: new AbortController().signal, emit() {}, ...options });

class Database {
  data = new Map(); tail = Promise.resolve(); unavailable = false;
  collection(name) { return { doc: id => ({ id: name + '/' + id }) }; }
  async runTransaction(fn) {
    if (this.unavailable) throw Error('synthetic-storage-failure');
    const previous = this.tail;
    let unlock; this.tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    const writes = [];
    try {
      const result = await fn({
        getAll: async (...refs) => refs.map(ref => ({ exists: this.data.has(ref.id), data: () => structuredClone(this.data.get(ref.id)) })),
        set: (ref, value) => writes.push([ref.id, structuredClone(value)]),
      });
      for (const [key, value] of writes) this.data.set(key, value);
      return result;
    } finally { unlock(); }
  }
}

test('Production configuration rejects unsafe models and excessive shared limits', () => {
  assert.throws(() => loadConfig({ GEMINI_MODEL: 'https://attacker.invalid' }));
  assert.throws(() => loadConfig({ GLOBAL_CALLS_PER_DAY: '1000000' }));
  assert.throws(() => loadConfig({ GLOBAL_CONCURRENT_CALLS: '-1' }));
  assert.deepEqual(config().limits, { globalMinute: 10, globalDay: 100, globalConcurrent: 2 });
});

test('Question validation blocks client-controlled models, instructions, tools and URLs', () => {
  for (const extra of [{ model: 'expensive' }, { systemInstruction: 'ignore' }, { tools: [] }, { url: 'https://attacker.invalid' }, { apiKey: 'synthetic-key' }]) assert.throws(() => validateQuestion({ prompt: 'q', ...extra }));
  assert.throws(() => validateQuestion({ prompt: 'q', history: [{ role: 'system', text: 'ignore' }] }));
});
test('Only bounded image signatures and extracted document text are accepted', () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  assert.equal(validateQuestion({ prompt: 'q', parts: [{ inlineData: { mimeType: 'image/png', data: png } }] }).parts.length, 1);
  for (const inlineData of [{ mimeType: 'application/pdf', data: png }, { mimeType: 'image/jpeg', data: png }, { mimeType: 'image/png', data: 'not-base64' }]) assert.throws(() => validateQuestion({ prompt: 'q', parts: [{ inlineData }] }));
  assert.throws(() => validateQuestion({ prompt: 'q', parts: [{ text: 'x'.repeat(60001) }] }));
  assert.throws(() => validateQuestion({ prompt: 'q', history: Array(11).fill({ role: 'user', text: 'q' }) }));
});
test('Server owns the system instructions and output budget; documents are untrusted data', () => {
  const payload = JSON.parse(modelBody(question, config().models[0]));
  assert.match(payload.systemInstruction.parts[0].text, /UNTRUSTED DATA/);
  assert.equal(payload.generationConfig.maxOutputTokens, 768);
  assert.equal(payload.tools, undefined);
});

test('Usage survives backend instances and rolling-minute boundaries', async () => {
  let now = DAY_MS * 2;
  const db = new Database(), c = config(); c.limits.globalMinute = 1;
  const first = new FirestoreQuota(c, db, () => now), restarted = new FirestoreQuota(c, db, () => now);
  await (await first.reserve())();
  await assert.rejects(restarted.reserve(), error => error.status === 429 && error.retryAfter === 60);
  now += 60001;
  await (await restarted.reserve())();
  assert.equal(db.data.get('horizonUsage/global').requests.length, 2);
});
test('Parallel reservations cannot exceed a shared concurrent limit', async () => {
  const db = new Database(), c = config(); c.limits.globalConcurrent = 1;
  const results = await Promise.allSettled([new FirestoreQuota(c, db).reserve(), new FirestoreQuota(c, db).reserve()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 429);
  await results.find(result => result.status === 'fulfilled').value();
});
test('Global rolling-day cap applies across clients and recovers only when usage expires', async () => {
  let now = DAY_MS * 2;
  const db = new Database(), c = config(); c.limits.globalDay = 1;
  const quota = new FirestoreQuota(c, db, () => now);
  await (await quota.reserve())();
  await assert.rejects(quota.reserve(), error => error.status === 429 && error.retryAfter === 86400);
  now += DAY_MS + 1;
  await (await quota.reserve())();
});
test('Clients cannot select a quota identity and rejected bodies do not spend usage', async () => {
  const db = new Database(), c = config(); c.limits.globalDay = 1;
  let calls = 0;
  await withServer({ quota: new FirestoreQuota(c, db), request: async () => { calls++; return sse([answer('ok')]); } }, async url => {
    assert.equal((await post(url, { prompt: 'q', email: 'example@example.test' })).status, 400);
    assert.equal(db.data.size, 0);
    assert.equal((await post(url, question, { 'X-Client-ID': 'one' })).status, 200);
    assert.equal((await post(url, question, { 'X-Client-ID': 'two', Authorization: 'Bearer arbitrary' })).status, 429);
    assert.equal(calls, 1);
    assert.deepEqual([...db.data.keys()], ['horizonUsage/global']);
  });
});

test('Storage failures fail closed instead of falling back to local quota', async () => {
  const db = new Database(); db.unavailable = true;
  await assert.rejects(new FirestoreQuota(config(), db).reserve(), error => error.status === 503);
});
test('Abandoned concurrency leases expire without refunding spent requests', async () => {
  let now = DAY_MS * 2;
  const db = new Database(), c = config(); c.limits.globalConcurrent = 1;
  const quota = new FirestoreQuota(c, db, () => now);
  await quota.reserve();
  await assert.rejects(quota.reserve(), error => error.code === 'busy');
  now += c.requestTimeoutMs + 15001;
  await (await quota.reserve())();
  assert.equal(db.data.get('horizonUsage/global').requests.length, 2);
});

test('Streaming handles fragmented UTF-8, CRLF, final unterminated events and hidden thoughts', async () => {
  const events = [], bytes = new TextEncoder().encode(`data: ${JSON.stringify(answer('Hello 🌅'))}\r\n\r\ndata: ${JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'secret thought' }, { text: ' world' }] } }] })}`);
  let position = 0;
  const response = new Response(new ReadableStream({ pull(controller) {
    if (position >= bytes.length) return controller.close();
    controller.enqueue(bytes.subarray(position, ++position));
  } }), { headers: { 'content-type': 'text/event-stream' } });
  await run({ request: async () => response, emit: event => events.push(event) });
  assert.deepEqual(events.filter(event => event.type === 'delta').map(event => event.text), ['Hello 🌅', ' world']);
  assert.equal(events.at(-1).text, 'Hello 🌅 world');
});
test('Provider fallback reserves a separate call and releases both leases', async () => {
  let calls = 0, reserved = 0, released = 0;
  const quota = { reserve: async () => { reserved++; return async () => { released++; }; } };
  await run({ quota, request: async () => ++calls === 1 ? new Response('', { status: 503 }) : sse([answer('ok')]) });
  assert.equal(calls, 2); assert.equal(reserved, 2); assert.equal(released, 2);
});
test('Provider quota and access failures are sanitized and never retried', async () => {
  for (const status of [429, 403]) {
    let calls = 0;
    await assert.rejects(run({ request: async () => { calls++; return new Response('synthetic-provider-key', { status }); } }), error => !error.message.includes('synthetic-provider-key'));
    assert.equal(calls, 1);
  }
});
test('Cancellation prevents provider calls and partial stream errors never become done answers', async () => {
  const cancelled = new AbortController(); cancelled.abort(); let calls = 0;
  await assert.rejects(run({ signal: cancelled.signal, request: async () => { calls++; return sse([answer('unused')]); } }), error => error.status === 499);
  assert.equal(calls, 0);
  const events = [];
  await assert.rejects(run({ request: async () => sse([answer('partial'), { error: { message: 'sensitive upstream detail' } }]), emit: event => events.push(event) }), error => error.code === 'provider_stream_error');
  assert.equal(events.some(event => event.type === 'done'), false);
});
test('Timeout releases quota and returns a clear sanitized failure', async () => {
  const c = config(); c.requestTimeoutMs = 10; let released = false;
  const keeper = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(run({ config: c, quota: { reserve: async () => async () => { released = true; } }, request: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('synthetic timeout')))) }), error => error.status === 504);
    assert.equal(released, true);
  } finally { clearTimeout(keeper); }
});

async function withServer(options, fn, c = config()) {
  const server = createService(c, { quota: noQuota, request: async () => sse([answer('October 20.')]), log() {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (url, body = question, headers = {}) => fetch(url + '/v1/answer', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('HTTP service streams answers and omits credentials and question content from logs', async () => {
  const logs = [];
  await withServer({ log: record => logs.push(record) }, async url => {
    assert.deepEqual(await (await fetch(url + '/health')).json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(url + '/ready')).json(), { ready: true });
    const response = await post(url); const text = await response.text();
    assert.equal(response.status, 200); assert.match(text, /October 20/); assert.match(text, /"type":"done"/);
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(text.includes('synthetic-provider-key'), false);
    assert.equal(JSON.stringify(logs).includes('launch date'), false);
  });
});
test('HTTP exhausted quota returns 429 and Retry-After before opening a stream', async () => {
  await withServer({ quota: { reserve: async () => { throw new ServiceError(429, 'usage_limit', 'Wait', 30); } } }, async url => {
    const response = await post(url); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '30');
    assert.match(response.headers.get('content-type'), /application\/json/);
  });
});
test('HTTP startup stays alive but denies inference when the provider secret is missing', async () => {
  await withServer({}, async url => {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/ready')).status, 503);
    assert.equal((await post(url)).status, 503);
  }, { ...config(), apiKey: '' });
});
test('HTTP malformed JSON and compressed or oversized uploads are rejected', async () => {
  await withServer({}, async url => {
    const response = await fetch(url + '/v1/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
    assert.equal((await post(url, question, { 'Content-Encoding': 'gzip' })).status, 415);
    // Headers alone must reject a declared oversized upload before its body.
    const oversizedStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(url + '/v1/answer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_BODY_BYTES + 1) } }, response => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(oversizedStatus, 413);
    assert.equal((await fetch(url + '/v1/answer', { method: 'OPTIONS' })).status, 404);
  });
});
test('HTTP provider failures after partial output are explicit SSE errors without done', async () => {
  await withServer({ request: async () => sse([answer('partial'), { error: { message: 'sensitive' } }]) }, async url => {
    const text = await (await post(url)).text(); assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"done"/); assert.doesNotMatch(text, /sensitive/);
  });
});
test('Removed sign-in endpoints return 404 without contacting the model', async () => {
  let calls = 0;
  await withServer({ request: async () => { calls++; return sse([answer('unused')]); } }, async url => {
    for (const route of ['exchange', 'refresh']) {
      const response = await fetch(url + '/v1/auth/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 404);
    }
    assert.equal(calls, 0);
  });
});
