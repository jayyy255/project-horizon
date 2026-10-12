import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { HORIZON_BACKEND_URL, HORIZON_OAUTH_CLIENT_ID } from '../shared/cloud';

export interface CloudSession { idToken: string; refreshToken: string; expiresAt: number; email: string; subject: string; }
export interface CloudAccountStatus { hosted: true; signedIn: boolean; email?: string; signingIn: boolean; }
interface Options {
  read: () => CloudSession | undefined; write: (session?: CloudSession) => void;
  openBrowser: (url: string) => Promise<void>; request?: typeof fetch;
  backendURL?: string; clientID?: string; now?: () => number; timeoutMs?: number;
  onChange?: (status: CloudAccountStatus) => void;
}
export class CloudAccount {
  private session?: CloudSession;
  private pending?: Promise<CloudAccountStatus>;
  private refresh?: Promise<void>;
  private cancel?: () => void;
  private revision = 0;
  private request: typeof fetch;
  private now: () => number;
  readonly backendURL: string;
  readonly clientID: string;
  constructor(private options: Options) {
    this.request = options.request || fetch; this.now = options.now || Date.now;
    this.backendURL = options.backendURL || HORIZON_BACKEND_URL;
    this.clientID = options.clientID || HORIZON_OAUTH_CLIENT_ID;
    try {
      const value = options.read();
      if (value?.idToken && value.refreshToken && Number.isFinite(value.expiresAt) && typeof value.email === 'string' && typeof value.subject === 'string') this.session = value;
    } catch {}
  }
  status(): CloudAccountStatus { return { hosted: true, signedIn: Boolean(this.session), email: this.session?.email, signingIn: Boolean(this.pending) }; }
  private notify() { this.options.onChange?.(this.status()); }
  private async exchange(mode: 'exchange' | 'refresh', payload: unknown): Promise<CloudSession> {
    let response: Response;
    try { response = await this.request(`${this.backendURL}/v1/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error('Could not reach Horizon sign-in. Check your connection and try again.'); }
    if (!response.ok) {
      const json = response.headers.get('content-type')?.includes('application/json') ? await response.json().catch(() => null) : null;
      if (response.status === 403 && !json) throw new Error('The Horizon service is still private. The app owner needs to finish backend access setup.');
      if (response.status === 403) throw new Error('This Google account is not approved for Horizon.');
      if (response.status === 503) throw new Error('Horizon sign-in is not configured on the backend yet.');
      if (response.status === 429) throw new Error('Sign-in is busy. Try again shortly.');
      throw new Error('Google could not complete sign-in. Please sign in again.');
    }
    const data = await response.json();
    if (typeof data.idToken !== 'string' || data.idToken.length > 8192 || !data.idToken || typeof data.refreshToken !== 'string' || data.refreshToken.length > 8192 || !data.refreshToken || typeof data.email !== 'string' || typeof data.subject !== 'string' || !Number.isFinite(data.expiresIn) || data.expiresIn < 1 || data.expiresIn > 86400) throw new Error('Horizon returned an invalid sign-in response.');
    return { idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: this.now() + data.expiresIn * 1000, email: data.email, subject: data.subject };
  }
  signIn(): Promise<CloudAccountStatus> {
    if (this.pending) return this.pending;
    const revision = ++this.revision;
    this.pending = this.performSignIn(revision).finally(() => { this.pending = undefined; this.cancel = undefined; this.notify(); });
    this.notify(); return this.pending;
  }
  private async performSignIn(revision: number): Promise<CloudAccountStatus> {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url');
    let resolveCode!: (code: string) => void, rejectCode!: (error: Error) => void;
    const codePromise = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    // Handle an early browser-launch failure without leaving a rejected promise.
    codePromise.catch(() => {});
    let redirectUri = '', consumed = false;
    const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'");
      const reply = (status: number, message: string) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(message); };
      if (!redirectUri || req.method !== 'GET' || req.url!.length > 8192 || req.headers.host !== new URL(redirectUri).host) { reply(400, 'Invalid sign-in callback.'); return; }
      const callback = new URL(req.url!, redirectUri);
      const received = callback.searchParams.get('state') || '';
      if (callback.pathname !== '/' || Buffer.byteLength(received) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(received), Buffer.from(state)) || consumed) { reply(400, 'Invalid sign-in callback. Return to Horizon and try again.'); return; }
      const error = callback.searchParams.get('error'), code = callback.searchParams.get('code');
      if (!error && (!code || code.length > 4096)) { reply(400, 'Missing sign-in code.'); return; }
      consumed = true;
      if (error) { reply(200, 'Sign-in cancelled. Return to Horizon.'); rejectCode(new Error('Google sign-in was cancelled.')); }
      else { reply(200, 'Google sign-in received. Return to Horizon to finish. You can close this tab.'); resolveCode(code!); }
    });
    server.requestTimeout = 10000; server.headersTimeout = 5000;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    redirectUri = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    const timer = setTimeout(() => rejectCode(new Error('Google sign-in timed out. Try again.')), this.options.timeoutMs || 180000);
    this.cancel = () => rejectCode(new Error('Google sign-in was cancelled.'));
    try {
      if (revision !== this.revision) throw new Error('Google sign-in was cancelled.');
      const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authorization.search = new URLSearchParams({ client_id: this.clientID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account' }).toString();
      await this.options.openBrowser(authorization.toString());
      const code = await codePromise;
      const next = await this.exchange('exchange', { code, verifier, redirectUri, nonce });
      if (revision !== this.revision) throw new Error('Sign-in was cancelled.');
      this.options.write(next); this.session = next; this.notify(); return this.status();
    } finally { clearTimeout(timer); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }
  cancelSignIn(): void { this.revision++; this.cancel?.(); }
  signOut(): CloudAccountStatus {
    this.options.write(undefined); this.revision++; this.cancel?.(); this.session = undefined; this.notify(); return this.status();
  }
  async token(): Promise<string> {
    if (!this.session) throw new Error('Sign in with Google in Preferences → Inference Engine to use Horizon.');
    if (this.session.expiresAt <= this.now() + 60000) {
      if (!this.refresh) {
        const previous = this.session, revision = this.revision;
        this.refresh = (async () => {
          const next = await this.exchange('refresh', { refreshToken: previous.refreshToken });
          if (revision !== this.revision || next.subject !== previous.subject) throw new Error('Your Horizon session changed. Sign in again.');
          this.options.write(next); this.session = next; this.notify();
        })().finally(() => { this.refresh = undefined; });
      }
      await this.refresh;
    }
    if (!this.session) throw new Error('Sign in again to use Horizon.');
    return this.session.idToken;
  }
}
