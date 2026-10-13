import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { ServiceError } from './errors.js';

export const DAY_MS = 86400000;
function state(data, now) {
  if (data && (!Array.isArray(data.requests) || !Array.isArray(data.active))) throw new Error('Invalid stored usage');
  const requests = (data?.requests || []).filter(time => Number.isFinite(time) && time > now - DAY_MS);
  const active = (data?.active || []).filter(lease => typeof lease.id === 'string' && Number.isFinite(lease.until) && lease.until > now);
  return { requests, active };
}
function checkUsage(value, now, minuteLimit, dayLimit, activeLimit) {
  const minute = value.requests.filter(time => time > now - 60000);
  const remainingDay = value.requests.length >= dayLimit ? Math.min(...value.requests) + DAY_MS - now : 0;
  const remainingMinute = minute.length >= minuteLimit ? Math.min(...minute) + 60000 - now : 0;
  if (remainingDay || remainingMinute) throw new ServiceError(429, 'usage_limit', 'Horizon usage limit reached. Try again later.', Math.max(1, Math.ceil(Math.max(remainingDay, remainingMinute) / 1000)));
  if (value.active.length >= activeLimit) throw new ServiceError(429, 'busy', 'Horizon already has active requests. Try again shortly.', 5);
}

export class FirestoreQuota {
  constructor(config, db = new Firestore({ projectId: config.projectId }), now = Date.now) {
    this.db = db; this.config = config; this.now = now;
  }
  refs() {
    return [this.db.collection('horizonUsage').doc('global')];
  }
  async reserve() {
    const refs = this.refs(), lease = randomUUID();
    try {
      await this.db.runTransaction(async transaction => {
        const snapshots = await transaction.getAll(...refs);
        const now = this.now(), limits = this.config.limits;
        const values = snapshots.map(snapshot => state(snapshot.exists ? snapshot.data() : undefined, now));
        checkUsage(values[0], now, limits.globalMinute, limits.globalDay, limits.globalConcurrent);
        for (const [index, value] of values.entries()) {
          value.requests.push(now);
          value.active.push({ id: lease, until: now + this.config.requestTimeoutMs + 15000 });
          transaction.set(refs[index], value);
        }
      }, { maxAttempts: 5 });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(503, 'usage_unavailable', 'Horizon cannot check usage right now. Try again shortly.', 10);
    }
    return async () => {
      try {
        await this.db.runTransaction(async transaction => {
          const snapshots = await transaction.getAll(...refs);
          const now = this.now();
          for (const [index, snapshot] of snapshots.entries()) {
            const value = state(snapshot.exists ? snapshot.data() : undefined, now);
            value.active = value.active.filter(item => item.id !== lease);
            transaction.set(refs[index], value);
          }
        }, { maxAttempts: 5 });
      } catch { /* Leases expire; never undo the already reserved call count. */ }
    };
  }
}
