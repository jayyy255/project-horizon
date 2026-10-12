import { OAuth2Client } from 'google-auth-library';
import { ServiceError } from './errors.js';

export function googleAuthenticator(config, client = new OAuth2Client()) {
  const allowed = new Set(config.allowedEmails);
  return async authorization => {
    if (!config.audience.length || !allowed.size) throw new ServiceError(503, 'access_not_configured', 'Horizon access is not configured.');
    const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization || '')?.[1];
    if (!token || token.length > 8192) throw new ServiceError(401, 'sign_in_required', 'Sign in to Horizon with Google.');
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: token, audience: config.audience });
      payload = ticket.getPayload();
    } catch { throw new ServiceError(401, 'invalid_session', 'Your Google session has expired or is invalid. Sign in again.'); }
    const email = payload?.email?.toLowerCase();
    if (!payload?.sub || !email || payload.email_verified !== true || !allowed.has(email)) {
      throw new ServiceError(403, 'account_not_allowed', 'This Google account does not have Horizon access.');
    }
    // Google is authoritative for Gmail and Workspace addresses. Third-party
    // addresses require an additional ownership check before email allowlisting.
    if (!email.endsWith('@gmail.com') && !payload.hd) throw new ServiceError(403, 'account_not_allowed', 'Use an approved Gmail or Google Workspace account.');
    return { subject: payload.sub };
  };
}
