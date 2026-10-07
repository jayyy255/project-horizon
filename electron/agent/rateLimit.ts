import fs from 'fs';
import path from 'path';

/** Local fair-use limits. A shared server is required for tamper-resistant limits. */
export class RequestLimiter {
  private requests: number[] = [];
  constructor(private file: string, private perMinute = 10, private perDay = 100, private now = Date.now) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved.requests)) this.requests = saved.requests.filter((value: unknown) => typeof value === 'number' && Number.isFinite(value));
    } catch {}
  }
  take(): { allowed: boolean; retryAfterSeconds?: number; error?: string } {
    const now = this.now();
    this.requests = this.requests.filter(time => time > now - 86400000);
    const minute = this.requests.filter(time => time > now - 60000);
    const blockedUntil = this.requests.length >= this.perDay ? Math.min(...this.requests) + 86400000
      : minute.length >= this.perMinute ? Math.min(...minute) + 60000 : 0;
    if (blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
      return { allowed: false, retryAfterSeconds, error: retryAfterSeconds > 3600
        ? 'Daily AI request limit reached. Please try again later.' : `AI request limit reached. Try again in ${retryAfterSeconds} seconds.` };
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ requests: [...this.requests, now] }), 'utf8');
    } catch { return { allowed: false, error: 'Could not save the AI usage limit. Please restart Horizon.' }; }
    this.requests.push(now);
    return { allowed: true };
  }
}
