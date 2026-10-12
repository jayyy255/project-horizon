import { ServiceError } from './errors.js';
import { googleAuthenticator } from './auth.js';

const invalid = () => { throw new ServiceError(400, 'invalid_sign_in', 'Invalid Horizon sign-in request.'); };
export function oauthBroker(config, { request = fetch, authenticate = googleAuthenticator(config) } = {}) {
  return async (mode, input) => {
    if (!config.oauthClientSecret || config.audience.length !== 1) throw new ServiceError(503, 'sign_in_not_configured', 'Horizon sign-in needs configuration by the app owner.');
    const keys = mode === 'exchange' ? ['code', 'verifier', 'redirectUri', 'nonce'] : ['refreshToken'];
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !keys.includes(key))) invalid();
    const body = new URLSearchParams({ client_id: config.audience[0], client_secret: config.oauthClientSecret });
    if (mode === 'exchange') {
      const port = /^http:\/\/127\.0\.0\.1:(\d+)\/$/.exec(input.redirectUri || '')?.[1];
      if (!port || Number(port) < 1024 || Number(port) > 65535 || typeof input.code !== 'string' || !input.code || input.code.length > 4096 || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier || '') || !/^[A-Za-z0-9_-]{32,128}$/.test(input.nonce || '')) invalid();
      body.set('grant_type', 'authorization_code'); body.set('code', input.code); body.set('code_verifier', input.verifier); body.set('redirect_uri', input.redirectUri);
    } else if (mode === 'refresh') {
      if (typeof input.refreshToken !== 'string' || !input.refreshToken || input.refreshToken.length > 8192) invalid();
      body.set('grant_type', 'refresh_token'); body.set('refresh_token', input.refreshToken);
    } else invalid();
    let response;
    try { response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) }); }
    catch { throw new ServiceError(502, 'sign_in_connection', 'Could not reach Google sign-in. Try again.'); }
    if (!response.ok) { await response.body?.cancel(); throw new ServiceError(401, 'sign_in_expired', 'Google could not complete sign-in. Sign in again.'); }
    const tokens = await response.json();
    if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 8192 || !Number.isFinite(tokens.expires_in) || tokens.expires_in < 1 || tokens.expires_in > 86400) throw new ServiceError(502, 'invalid_sign_in_response', 'Google returned an incomplete sign-in response.');
    const identity = await authenticate('Bearer ' + tokens.id_token);
    if (mode === 'exchange' && identity.nonce !== input.nonce) throw new ServiceError(401, 'invalid_sign_in', 'Google sign-in could not be verified. Try again.');
    const refreshToken = tokens.refresh_token || (mode === 'refresh' ? input.refreshToken : undefined);
    if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 8192) throw new ServiceError(401, 'consent_required', 'Sign in again and allow Horizon to keep you signed in.');
    // Access tokens, OAuth client secrets and provider error bodies are never
    // returned. Only the approved user's own session reaches their desktop.
    return { idToken: tokens.id_token, refreshToken, expiresIn: tokens.expires_in, email: identity.email, subject: identity.subject };
  };
}
