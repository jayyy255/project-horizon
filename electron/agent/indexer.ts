import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

export interface InstalledAppRecord {
  appId: string;
  name: string;
  exePath?: string;
  isStoreApp: boolean;
  rawAppId: string;
}

export interface IndexedRecord {
  id?: number;
  name: string;
  path: string;
  manifest_type: string;
  content: string;
  rank?: number;
}

export interface SearchResult {
  name: string;
  path: string;
  manifest_type: string;
  score: number;
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

export class ProjectIndexer {
  private db: any = null;
  private inMemoryIndex: Array<{ name: string; path: string; manifest_type: string; content: string }> = [];
  private inMemoryApps: Map<string, InstalledAppRecord> = new Map();

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
        console.warn('[ProjectIndexer] SQLite fallback to in-memory search:', err);
        this.db = null;
      }
    }
    // Index installed StartApps on initialization
    this.indexInstalledApps();
  }

  private initialize(): void {
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS project_index USING fts5(
        name,
        path,
        manifest_type,
        content,
        tokenize = 'porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS installed_apps (
        app_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lower_name TEXT NOT NULL,
        exe_path TEXT,
        is_store_app INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_installed_apps_lower ON installed_apps(lower_name);
    `);
  }

  public indexInstalledApps(): InstalledAppRecord[] {
    try {
      const raw = execSync('powershell -NoProfile -Command "Get-StartApps | ConvertTo-Json -Compress"', {
        encoding: 'utf8',
        maxBuffer: 25 * 1024 * 1024,
        timeout: 8000,
      });
      const apps = JSON.parse(raw.trim() || '[]');
      if (Array.isArray(apps)) {
        const records: InstalledAppRecord[] = [];
        const now = Date.now();
        const insertStmt = this.db ? this.db.prepare(`
          INSERT INTO installed_apps (app_id, name, lower_name, exe_path, is_store_app, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(app_id) DO UPDATE SET
            name = excluded.name,
            lower_name = excluded.lower_name,
            exe_path = excluded.exe_path,
            is_store_app = excluded.is_store_app,
            updated_at = excluded.updated_at
        `) : null;

        for (const app of apps) {
          const name = String(app.Name || '').trim();
          const rawId = String(app.AppID || '').trim();
          if (!name || !rawId) continue;

          let exePath: string | undefined;
          let isStoreApp = false;

          if (fs.existsSync(rawId)) {
            exePath = rawId;
            isStoreApp = false;
          } else if (rawId.toLowerCase().endsWith('.exe') && fs.existsSync(rawId)) {
            exePath = rawId;
            isStoreApp = false;
          } else if (name.toLowerCase() === 'visual studio code' || name.toLowerCase() === 'code') {
            const userCode = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe');
            if (fs.existsSync(userCode)) {
              exePath = userCode;
            }
            isStoreApp = false;
          } else {
            isStoreApp = rawId.includes('!') || !rawId.includes('\\');
          }

          const record: InstalledAppRecord = {
            appId: rawId,
            name,
            exePath,
            isStoreApp,
            rawAppId: rawId,
          };

          this.inMemoryApps.set(name.toLowerCase(), record);
          this.inMemoryApps.set(rawId.toLowerCase(), record);
          records.push(record);

          if (insertStmt) {
            insertStmt.run(rawId, name, name.toLowerCase(), exePath || null, isStoreApp ? 1 : 0, now);
          }
        }
        return records;
      }
    } catch (err) {
      console.warn('[ProjectIndexer] Get-StartApps indexing error:', err);
    }
    return Array.from(this.inMemoryApps.values());
  }

  public findInstalledApp(query: string): InstalledAppRecord | null {
    const q = query.toLowerCase().trim();
    if (!q) return null;

    if (this.inMemoryApps.has(q)) {
      return this.inMemoryApps.get(q)!;
    }

    if (this.db) {
      try {
        const row = this.db.prepare(`
          SELECT * FROM installed_apps
          WHERE lower_name = ? OR lower_name LIKE ? OR LOWER(app_id) LIKE ?
          ORDER BY (CASE WHEN lower_name = ? THEN 0 WHEN lower_name LIKE ? THEN 1 ELSE 2 END)
          LIMIT 1
        `).get(q, `${q}%`, `%${q}%`, q, `${q}%`) as any;

        if (row) {
          return {
            appId: row.app_id,
            name: row.name,
            exePath: row.exe_path || undefined,
            isStoreApp: Boolean(row.is_store_app),
            rawAppId: row.app_id,
          };
        }
      } catch {}
    }

    for (const [key, app] of this.inMemoryApps.entries()) {
      if (key === q || key.startsWith(q) || app.name.toLowerCase().includes(q)) {
        return app;
      }
    }

    return null;
  }

  public indexItem(item: {
    name: string;
    path: string;
    manifest_type?: string;
    content?: string;
  }): void {
    const record = {
      name: item.name,
      path: item.path,
      manifest_type: item.manifest_type || '',
      content: item.content || ''
    };
    this.inMemoryIndex.push(record);

    if (this.db) {
      try {
        const insertStmt = this.db.prepare(`
          INSERT INTO project_index (name, path, manifest_type, content)
          VALUES (?, ?, ?, ?)
        `);
        insertStmt.run(record.name, record.path, record.manifest_type, record.content);
      } catch (err) {
        // Fallback continues in inMemoryIndex
      }
    }
  }

  public bulkIndex(items: Array<{
    name: string;
    path: string;
    manifest_type?: string;
    content?: string;
  }>): void {
    for (const item of items) {
      this.indexItem(item);
    }
  }

  public indexDirectory(rootDir: string, maxDepth = 4): number {
    if (!fs.existsSync(rootDir)) return 0;

    let count = 0;
    const targetManifests = new Set([
      'package.json',
      'requirements.txt',
      'Cargo.toml',
      'go.mod',
      'pyproject.toml',
      'CMakeLists.txt',
      '.git',
    ]);

    const crawl = (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.venv' || entry.name === 'dist') {
            continue;
          }
          if (entry.name === '.git') {
            const gitConfig = path.join(fullPath, 'config');
            let content = '';
            if (fs.existsSync(gitConfig)) {
              try {
                content = fs.readFileSync(gitConfig, 'utf8').slice(0, 1000);
              } catch {}
            }
            this.indexItem({
              name: path.basename(currentDir),
              path: currentDir,
              manifest_type: 'git',
              content,
            });
            count++;
            continue;
          }

          this.indexItem({
            name: entry.name,
            path: fullPath,
            manifest_type: 'folder',
            content: '',
          });
          count++;

          crawl(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (targetManifests.has(entry.name)) {
            let content = '';
            try {
              content = fs.readFileSync(fullPath, 'utf8').slice(0, 2000);
            } catch {}
            this.indexItem({
              name: entry.name,
              path: fullPath,
              manifest_type: entry.name,
              content,
            });
            count++;
          }
        }
      }
    };

    crawl(rootDir, 0);
    return count;
  }

  public findPath(query: string, limit = 10): SearchResult[] {
    const sanitized = query.trim().replace(/['"*]/g, '');
    if (!sanitized) return [];

    if (this.db) {
      try {
        const tokens = sanitized.split(/\s+/).filter(Boolean);
        const ftsQuery = tokens.map(t => `"${t}"*`).join(' OR ');

        const stmt = this.db.prepare(`
          SELECT 
            name, 
            path, 
            manifest_type, 
            bm25(project_index) as score
          FROM project_index
          WHERE project_index MATCH ?
          ORDER BY score
          LIMIT ?
        `);

        const rows = stmt.all(ftsQuery, limit) as Array<{
          name: string;
          path: string;
          manifest_type: string;
          score: number;
        }>;
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            name: r.name,
            path: r.path,
            manifest_type: r.manifest_type,
            score: Math.abs(r.score),
          }));
        }
      } catch {
        // Fallback to in-memory filter below
      }
    }

    // In-memory tokenized match fallback
    const tokens = sanitized.toLowerCase().split(/\s+/).filter(Boolean);
    const matches: SearchResult[] = [];
    for (const item of this.inMemoryIndex) {
      const name = item.name.toLowerCase();
      const itemPath = item.path.toLowerCase();
      const content = (item.content || '').toLowerCase();
      const matchesAll = tokens.every(t => name.includes(t) || itemPath.includes(t) || content.includes(t));
      const matchesAny = tokens.some(t => name.includes(t) || itemPath.includes(t));
      if (matchesAll || matchesAny) {
        matches.push({
          name: item.name,
          path: item.path,
          manifest_type: item.manifest_type,
          score: matchesAll ? 1.0 : 0.5,
        });
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
    }
  }
}
