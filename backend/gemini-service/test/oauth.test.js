import test from 'node:test';
import assert from 'node:assert/strict';
import { oauthBroker } from '../src/oauth.js';
import { ServiceError } from '../src/errors.js';
import { loadConfig } from '../src/config.js';
const config = loadConfig({ GEMINI_API_KEY: 'synthetic-gemini-key', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-oauth-secret', GOOGLE_OAUTH_CLIENT_IDS: '123-horizon.apps.googleusercontent.com', ALLOWED_EMAILS: 'approved@gmail.com' });
const input = { code: 'synthetic-code', verifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43210/', nonce: 'n'.repeat(43) };
const identity = { subject: 'test-user', email: 'approved@gmail.com', nonce: input.nonce };
const tokens = () => new Response(JSON.stringify({ id_token: 'synthetic.id.token', refresh_token: 'synthetic-refresh', expires_in: 3600, access_token: 'never-return-this' }));
test('OAuth exchange keeps the client secret server-side and only returns the approved user session', async () => {
  let sent;
  const broker = oauthBroker(config, { request: async (url, options) => { assert.equal(url, 'https://oauth2.googleapis.com/token'); sent = options.body; return tokens(); }, authenticate: async () => identity });
  const result = await broker('exchange', input);
  assert.equal(sent.get('client_secret'), config.oauthClientSecret); assert.equal(sent.get('code_verifier'), input.verifier);
  assert.equal(result.idToken, 'synthetic.id.token'); assert.equal(JSON.stringify(result).includes(config.oauthClientSecret), false); assert.equal(JSON.stringify(result).includes('never-return-this'), false);
});
test('OAuth blocks remote redirects, missing PKCE, client-controlled credentials and nonce mismatch', async () => {
  let calls = 0;
  const broker = oauthBroker(config, { request: async () => { calls++; return tokens(); }, authenticate: async () => identity });
  for (const bad of [{ redirectUri: 'https://attacker.invalid/' }, { redirectUri: 'http://127.0.0.1:80/' }, { verifier: '' }, { client_secret: 'attacker' }, { client_id: 'attacker' }]) await assert.rejects(broker('exchange', { ...input, ...bad }), error => error.status === 400);
  assert.equal(calls, 0);
  await assert.rejects(oauthBroker(config, { request: async () => tokens(), authenticate: async () => ({ ...identity, nonce: 'different' }) })('exchange', input), error => error.status === 401);
});
test('OAuth does not return tokens for a denied identity or raw provider error', async () => {
  const denied = oauthBroker(config, { request: async () => tokens(), authenticate: async () => { throw new ServiceError(403, 'account_not_allowed', 'Denied'); } });
  await assert.rejects(denied('exchange', input), error => error.status === 403);
  const failed = oauthBroker(config, { request: async () => new Response(config.oauthClientSecret, { status: 400 }) });
  await assert.rejects(failed('exchange', input), error => !error.message.includes(config.oauthClientSecret));
});
test('Refresh preserves the session token when Google omits a new refresh token', async () => {
  const broker = oauthBroker(config, { request: async (_url, options) => { assert.equal(options.body.get('grant_type'), 'refresh_token'); return new Response(JSON.stringify({ id_token: 'synthetic.id.token', expires_in: 3600 })); }, authenticate: async () => identity });
  assert.equal((await broker('refresh', { refreshToken: 'existing-refresh' })).refreshToken, 'existing-refresh');
});
test('Missing OAuth configuration and malformed refresh inputs fail closed', async () => {
  await assert.rejects(oauthBroker({ ...config, oauthClientSecret: '' })('exchange', input), error => error.status === 503);
  await assert.rejects(oauthBroker(config)('refresh', { refreshToken: '', email: 'approved@gmail.com' }), error => error.status === 400);
});
