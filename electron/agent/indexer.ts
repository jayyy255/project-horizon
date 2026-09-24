import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

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
    `);
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
