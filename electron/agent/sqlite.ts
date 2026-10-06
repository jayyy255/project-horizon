import path from 'path';
import { createRequire } from 'module';

export function agentDataPath(filename: string) {
  try {
    const { app } = require('electron');
    if (app?.isReady()) return path.join(app.getPath('userData'), filename);
  } catch {}
  return path.join(process.cwd(), filename);
}

/** Use Electron's own SQLite runtime so storage survives native-addon ABI changes. */
export function resolveSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return class SqliteDatabase {
      private database: any;
      constructor(filename: string) { this.database = new DatabaseSync(filename); }
      pragma(statement: string) { return this.database.prepare(`PRAGMA ${statement}`).all(); }
      exec(sql: string) { return this.database.exec(sql); }
      prepare(sql: string) { return this.database.prepare(sql); }
      close() { this.database.close(); }
    };
  } catch {
    try { return require('better-sqlite3'); }
    catch {
      try { return createRequire(path.resolve(__dirname, '../../../backend/agent-service/package.json'))('better-sqlite3'); }
      catch { return null; }
    }
  }
}
