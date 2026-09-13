import Database from 'better-sqlite3';

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

export class AuditDatabase {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
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

  /**
   * Redacts PII in place (§8.5) before saving to audit DB or sending to Gemini.
   */
  public static maskPII(text: string): string {
    if (!text) return '';
    return text
      // Redact email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Redact card-like 13-19 digit sequences
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD_NUMBER]')
      // Redact standard phone numbers (international or domestic)
      .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  }

  public createSession(session: AuditSession): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (session_id, task_prompt, start_time, outcome, crop_metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.sessionId,
      AuditDatabase.maskPII(session.taskPrompt),
      session.startTime,
      session.outcome,
      session.cropMetadata || null
    );
  }

  public updateSessionOutcome(sessionId: string, outcome: AuditSession['outcome']): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET outcome = ?, end_time = ? WHERE session_id = ?
    `);
    stmt.run(outcome, Date.now(), sessionId);
  }

  public logToolTrace(trace: AuditToolTrace): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_traces (
        session_id, step_index, tool_name, args_json, narration, tier, authorized, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      trace.sessionId,
      trace.stepIndex,
      trace.toolName,
      AuditDatabase.maskPII(trace.argsJson),
      trace.narration,
      trace.tier,
      trace.authorized ? 1 : 0,
      trace.durationMs || 0,
      trace.timestamp
    );
  }

  public logTier2Approval(approval: Tier2ApprovalRecord): void {
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
  }

  public getSession(sessionId: string): AuditSession | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    if (!row) return undefined;
    return {
      sessionId: row.session_id,
      taskPrompt: row.task_prompt,
      startTime: row.start_time,
      endTime: row.end_time,
      outcome: row.outcome,
      cropMetadata: row.crop_metadata,
    };
  }

  public getToolTraces(sessionId: string): AuditToolTrace[] {
    const stmt = this.db.prepare('SELECT * FROM tool_traces WHERE session_id = ? ORDER BY step_index ASC');
    const rows = stmt.all(sessionId) as any[];
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

  public close(): void {
    this.db.close();
  }
}
