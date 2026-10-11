import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { LatencyReport } from '../shared/types';

const reports = new Map<string, LatencyTrace>();
export const latencyLogPath = () => path.join(app.getPath('userData'), 'latency.jsonl');
export class LatencyTrace {
  readonly id = randomUUID();
  private started = performance.now();
  private finished?: number;
  private stages: LatencyReport['stages'] = [];
  constructor(readonly source: string) {
    reports.set(this.id, this);
    if (reports.size > 300) reports.delete(reports.keys().next().value!);
  }
  add(name: string, durationMs: number, status: 'ok' | 'error' = 'ok') {
    this.stages.push({ name, durationMs: +Math.max(0, durationMs).toFixed(2), status });
  }
  async measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const start = performance.now();
    try { const result = await fn(); this.add(name, performance.now() - start); return result; }
    catch (error) { this.add(name, performance.now() - start, 'error'); throw error; }
  }
  report(): LatencyReport { return { id: this.id, source: this.source, stages: [...this.stages], totalMs: +((this.finished ?? performance.now()) - this.started).toFixed(2) }; }
  save() {
    this.finished ??= performance.now();
    const report = this.report();
    try {
      const file = latencyLogPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.previous');
      fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), ...report }) + '\n');
    } catch { console.warn('[Horizon] Could not save latency log.'); }
    return report;
  }
  static get(id: string) { return reports.get(id); }
}
