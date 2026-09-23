import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

export interface AuditSession {
  sessionId: string;
  taskPrompt: string;
  startTime: number;
  endTime?: number;
  outcome: 'in-progress' | 'succeeded' | 'failed' | 'cancelled';
  cropMetadata?: string;
}

export interface AuditToolTrace {
  sessionId: string;
  stepIndex: number;
  toolName: string;
  argsJson: string;
  narration: string;
  tier: number;
  authorized: boolean;
  durationMs?: number;
  timestamp: number;
}

export interface Tier2ApprovalRecord {
  actionId: string;
  sessionId: string;
  actionPayload: string;
  authorized: boolean;
  timestamp: number;
}

function resolveSqlite() {
  try {
    return require('better-sqlite3');
  } catch {
    try {
      const agentReq = createRequire(path.resolve(__dirname, '../../../backend/agent-service/package.json'));
      return agentReq('better-sqlite3');
    } catch {
      return null;
    }
  }
}

export class AuditDatabase {
  private db: any = null;
  private inMemorySessions: Map<string, AuditSession> = new Map();
  private inMemoryTraces: AuditToolTrace[] = [];
  private inMemoryApprovals: Tier2ApprovalRecord[] = [];

  constructor(dbPath: string = ':memory:') {
    const Sqlite = resolveSqlite();
    if (Sqlite) {
      try {
        if (dbPath !== ':memory:') {
          const dir = path.dirname(dbPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Sqlite(dbPath);
        this.initialize();
      } catch (err) {
        console.warn('[AuditDatabase] SQLite initialization fallback to memory store:', err);
        this.db = null;
      }
    }
  }

  private initialize(): void {
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        task_prompt TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        outcome TEXT NOT NULL,
        crop_metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS tool_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        narration TEXT NOT NULL,
        tier INTEGER NOT NULL,
        authorized INTEGER NOT NULL,
        duration_ms REAL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS tier2_approvals (
        action_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        action_payload TEXT NOT NULL,
        authorized INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  public static maskPII(text: string): string {
    if (!text) return '';
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD_NUMBER]')
      .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  }

  public createSession(session: AuditSession): void {
    const maskedPrompt = AuditDatabase.maskPII(session.taskPrompt);
    const cleanedSession = { ...session, taskPrompt: maskedPrompt };
    this.inMemorySessions.set(session.sessionId, cleanedSession);

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO sessions (session_id, task_prompt, start_time, outcome, crop_metadata)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
          session.sessionId,
          maskedPrompt,
          session.startTime,
          session.outcome,
          session.cropMetadata || null
        );
      } catch (err) {
        console.warn('[AuditDatabase.createSession] DB write error:', err);
      }
    }
  }

  public updateSessionOutcome(sessionId: string, outcome: AuditSession['outcome']): void {
    const existing = this.inMemorySessions.get(sessionId);
    if (existing) {
      existing.outcome = outcome;
      existing.endTime = Date.now();
    }

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          UPDATE sessions SET outcome = ?, end_time = ? WHERE session_id = ?
        `);
        stmt.run(outcome, Date.now(), sessionId);
      } catch (err) {
        console.warn('[AuditDatabase.updateSessionOutcome] DB update error:', err);
      }
    }
  }

  public logToolTrace(trace: AuditToolTrace): void {
    const maskedArgs = AuditDatabase.maskPII(trace.argsJson);
    const cleaned = { ...trace, argsJson: maskedArgs };
    this.inMemoryTraces.push(cleaned);

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO tool_traces (
            session_id, step_index, tool_name, args_json, narration, tier, authorized, duration_ms, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          trace.sessionId,
          trace.stepIndex,
          trace.toolName,
          maskedArgs,
          trace.narration,
          trace.tier,
          trace.authorized ? 1 : 0,
          trace.durationMs || 0,
          trace.timestamp
        );
      } catch (err) {
        console.warn('[AuditDatabase.logToolTrace] DB insert error:', err);
      }
    }
  }

  public logTier2Approval(approval: Tier2ApprovalRecord): void {
    this.inMemoryApprovals.push(approval);

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO tier2_approvals (action_id, session_id, action_payload, authorized, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
          approval.actionId,
          approval.sessionId,
          approval.actionPayload,
          approval.authorized ? 1 : 0,
          approval.timestamp
        );
      } catch (err) {
        console.warn('[AuditDatabase.logTier2Approval] DB insert error:', err);
      }
    }
  }

  public getSession(sessionId: string): AuditSession | undefined {
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
        const row = stmt.get(sessionId) as any;
        if (row) {
          return {
            sessionId: row.session_id,
            taskPrompt: row.task_prompt,
            startTime: row.start_time,
            endTime: row.end_time,
            outcome: row.outcome,
            cropMetadata: row.crop_metadata,
          };
        }
      } catch {}
    }
    return this.inMemorySessions.get(sessionId);
  }

  public getToolTraces(sessionId: string): AuditToolTrace[] {
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM tool_traces WHERE session_id = ? ORDER BY step_index ASC');
        const rows = stmt.all(sessionId) as any[];
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            sessionId: r.session_id,
            stepIndex: r.step_index,
            toolName: r.tool_name,
            argsJson: r.args_json,
            narration: r.narration,
            tier: r.tier,
            authorized: Boolean(r.authorized),
            durationMs: r.duration_ms,
            timestamp: r.timestamp,
          }));
        }
      } catch {}
    }
    return this.inMemoryTraces.filter(t => t.sessionId === sessionId);
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
    }
  }
}
