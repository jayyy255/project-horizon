import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { ServiceError } from './errors.js';
import { configured } from './config.js';
import { googleAuthenticator } from './auth.js';
import { FirestoreQuota } from './quota.js';
import { streamAnswer, modelBody } from './gemini.js';
import { MAX_BODY_BYTES, validateQuestion } from './validation.js';
import { oauthBroker } from './oauth.js';

async function readJSON(req, maximum = MAX_BODY_BYTES) {
  if (!/^application\/json(?:;.*)?$/i.test(req.headers['content-type'] || '')) throw new ServiceError(415, 'json_required', 'Send JSON question context.');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new ServiceError(415, 'encoding_not_supported', 'Compressed uploads are unsupported.');
  const length = req.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new ServiceError(413, 'upload_too_large', 'Upload exceeds the request limit.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new ServiceError(413, 'upload_too_large', 'Upload exceeds the request limit.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new ServiceError(400, 'invalid_json', 'Invalid JSON question.'); }
  return body;
}

export function createService(config, { authenticate = googleAuthenticator(config), quota = new FirestoreQuota(config), request = fetch, signIn = oauthBroker(config), log = record => console.log(JSON.stringify(record)) } = {}) {
  let inFlight = 0;
  const signInAttempts = [];
  const server = http.createServer(async (req, res) => {
    const id = randomUUID(), started = performance.now(), controller = new AbortController();
    let counted = false, finished = false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', id);
    res.on('close', () => { if (!finished) controller.abort(); });
    req.on('aborted', () => controller.abort());
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      // Cloud Run reserves some paths ending in z. Keep old local aliases, but
      // use /health and /ready for deployed checks.
      if (req.method === 'GET' && ['/health', '/healthz'].includes(req.url)) { json(200, { status: 'ok' }); return; }
      if (req.method === 'GET' && ['/ready', '/readyz'].includes(req.url)) { json(configured(config) ? 200 : 503, { ready: configured(config) }); return; }
      if (req.method !== 'POST' || !['/v1/answer', '/v1/auth/exchange', '/v1/auth/refresh'].includes(req.url)) throw new ServiceError(404, 'not_found', 'Endpoint not found.');
      if (!configured(config)) throw new ServiceError(503, 'not_configured', 'Horizon access is not configured.');
      if (inFlight >= 4) throw new ServiceError(429, 'busy', 'Horizon is busy. Try again shortly.', 5);
      inFlight++; counted = true;
      if (req.url.startsWith('/v1/auth/')) {
        const now = Date.now();
        while (signInAttempts.length && signInAttempts[0] <= now - 60000) signInAttempts.shift();
        if (signInAttempts.length >= 20) throw new ServiceError(429, 'sign_in_busy', 'Sign-in is busy. Try again shortly.', 60);
        signInAttempts.push(now);
        const tokens = await signIn(req.url.endsWith('/exchange') ? 'exchange' : 'refresh', await readJSON(req, 16384));
        json(200, tokens); return;
      }
      const authAt = performance.now();
      const user = await authenticate(req.headers.authorization);
      const authMs = performance.now() - authAt;
      const question = validateQuestion(await readJSON(req));
      for (const model of config.models) modelBody(question, model);
      // Reserve the first call before opening the stream, so denied usage can
      // return an ordinary HTTP 429 rather than a successful SSE response.
      const releaseFirst = await quota.reserve(user.subject);
      let firstReservation = true;
      const reservedQuota = { reserve: async subject => {
        if (firstReservation) { firstReservation = false; return releaseFirst; }
        return quota.reserve(subject);
      } };
      let queued = 0, drained = Promise.resolve(), writeError;
      const enqueue = event => {
        const bytes = Buffer.from(`data: ${JSON.stringify(event)}\n\n`);
        queued += bytes.length;
        if (queued > 1024 * 1024) { controller.abort(); throw new ServiceError(499, 'slow_client', 'The client is not reading the response.'); }
        drained = drained.then(async () => {
          if (res.destroyed) return;
          if (!res.write(bytes)) await once(res, 'drain', { signal: controller.signal });
          queued -= bytes.length;
        }).catch(error => { writeError = error; controller.abort(); });
      };
      try {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        enqueue({ type: 'timing', stage: 'authentication', durationMs: authMs });
        try {
          const result = await streamAnswer({ question, subject: user.subject, config, quota: reservedQuota, signal: controller.signal, emit: enqueue, request });
          log({ requestId: id, status: 200, upstreamCalls: result.upstreamCalls, durationMs: performance.now() - started });
        } catch (error) {
          const safe = error instanceof ServiceError ? error : new ServiceError(500, 'internal_error', 'Horizon could not complete the response.');
          if (!controller.signal.aborted && !res.destroyed) enqueue({ type: 'error', code: safe.code, message: safe.message, retryAfter: safe.retryAfter });
          log({ requestId: id, status: safe.status, code: safe.code, durationMs: performance.now() - started });
        }
        await drained;
        if (writeError) throw new ServiceError(499, 'client_disconnected', 'Client disconnected.');
        finished = true; res.end();
      } finally { if (firstReservation) await releaseFirst(); }
    } catch (error) {
      const safe = error instanceof ServiceError ? error : new ServiceError(500, 'internal_error', 'Horizon could not process the request.');
      if (!res.headersSent && !res.destroyed) {
        if (safe.retryAfter) res.setHeader('Retry-After', String(safe.retryAfter));
        res.setHeader('Connection', 'close');
        json(safe.status, { error: { code: safe.code, message: safe.message, requestId: id } });
      } else if (!res.destroyed) res.end();
      log({ requestId: id, status: safe.status, code: safe.code, durationMs: performance.now() - started });
    } finally { finished = true; if (counted) inFlight--; }
  });
  server.requestTimeout = 20000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 30;
  return server;
}
