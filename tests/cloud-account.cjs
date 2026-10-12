const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CloudAccount } = require('../dist-electron/electron/cloudAccount');
const { createHash } = require('node:crypto');
const response = changes => new Response(JSON.stringify({ idToken: 'synthetic.id.token', refreshToken: 'synthetic-refresh', expiresIn: 3600, email: 'approved@example.test', subject: 'user-one', ...changes }), { headers: { 'Content-Type': 'application/json' } });
function setup(overrides = {}) {
  let saved, time = 100000;
  const options = { read: () => saved, write: value => { saved = value; }, now: () => time, request: async () => response(), openBrowser: async url => {
    const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', auth.searchParams.get('state')); callback.searchParams.set('code', 'synthetic-code');
    await fetch(callback);
  }, ...overrides };
  return { options, account: new CloudAccount(options), saved: () => saved, advance: ms => { time += ms; } };
}
test('Sign-in uses the system browser, random loopback, state, nonce and PKCE without a client secret', async () => {
  let auth, exchange;
  const fixture = setup({ openBrowser: async url => {
    auth = new URL(url); assert.equal(auth.origin, 'https://accounts.google.com');
    assert.equal(auth.searchParams.get('scope'), 'openid email profile');
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    assert.equal(callback.hostname, '127.0.0.1');
    callback.searchParams.set('state', auth.searchParams.get('state')); callback.searchParams.set('code', 'synthetic-code');
    await fetch(callback);
  }, request: async (_url, options) => { exchange = JSON.parse(options.body); return response(); } });
  const status = await fixture.account.signIn();
  assert.equal(status.signedIn, true);
  assert.equal(createHash('sha256').update(exchange.verifier).digest('base64url'), auth.searchParams.get('code_challenge'));
  assert.equal(exchange.nonce, auth.searchParams.get('nonce'));
  assert.equal('client_secret' in exchange, false);
  assert.equal('idToken' in fixture.account.status(), false);
  assert.equal('refreshToken' in fixture.account.status(), false);
});
test('Wrong and Unicode callback states are rejected without consuming the real sign-in', async () => {
  const fixture = setup({ openBrowser: async url => {
    const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', 'x'.repeat(43));
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', 'é'.repeat(43)); assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', auth.searchParams.get('state')); assert.equal((await fetch(callback)).status, 200);
  } });
  assert.equal((await fixture.account.signIn()).signedIn, true);
});
test('Google cancellation and browser failures do not save a session', async () => {
  for (const openBrowser of [async () => { throw Error('Browser unavailable'); }, async url => {
    const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', auth.searchParams.get('state')); callback.searchParams.set('error', 'access_denied'); await fetch(callback);
  }]) {
    const fixture = setup({ openBrowser }); await assert.rejects(fixture.account.signIn());
    assert.equal(fixture.saved(), undefined); assert.equal(fixture.account.status().signingIn, false);
  }
});
test('Duplicate clicks share one login; a timeout closes the loopback server', async () => {
  let callback;
  const fixture = setup({ timeoutMs: 20, openBrowser: async url => { callback = new URL(url).searchParams.get('redirect_uri'); } });
  const first = fixture.account.signIn(); assert.equal(fixture.account.signIn(), first);
  await assert.rejects(first, /timed out/);
  await assert.rejects(fetch(callback));
});
test('Logout while an exchange is pending cannot restore the old session', async () => {
  let resolve, requested;
  const arrived = new Promise(done => { requested = done; });
  const fixture = setup({ request: async () => { requested(); return new Promise(done => { resolve = done; }); } });
  const login = fixture.account.signIn(); await arrived;
  fixture.account.signOut(); resolve(response()); await assert.rejects(login, /cancelled/);
  assert.equal(fixture.saved(), undefined); assert.equal(fixture.account.status().signedIn, false);
});
test('Saved sessions restore; refresh is deduplicated and cannot switch identities', async () => {
  let saved = { idToken: 'old-token', refreshToken: 'synthetic-refresh', expiresAt: 100000, email: 'approved@example.test', subject: 'user-one' }, calls = 0;
  const options = { read: () => saved, write: value => { saved = value; }, openBrowser: async () => {}, now: () => 100000, request: async () => { calls++; return response(); } };
  const account = new CloudAccount(options);
  assert.equal(account.status().signedIn, true);
  assert.deepEqual(await Promise.all([account.token(), account.token()]), ['synthetic.id.token', 'synthetic.id.token']); assert.equal(calls, 1);
  assert.equal(new CloudAccount(options).status().signedIn, true);
  saved.expiresAt = 0;
  const switched = new CloudAccount({ ...options, request: async () => response({ subject: 'other-user' }) });
  await assert.rejects(switched.token(), /changed/);
});
test('Private service and denied-account failures are explained without saving tokens', async () => {
  for (const headers of [{ 'Content-Type': 'text/html' }, { 'Content-Type': 'application/json' }]) {
    const fixture = setup({ request: async () => new Response(headers['Content-Type'] === 'text/html' ? 'Google denied' : '{}', { status: 403, headers }) });
    await assert.rejects(fixture.account.signIn(), headers['Content-Type'] === 'text/html' ? /still private/ : /not approved/);
    assert.equal(fixture.saved(), undefined);
  }
});
