import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

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

export class ProjectIndexer {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Enable WAL mode for high concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Create FTS5 virtual table with porter tokenizer for stemming
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

  /**
   * Inserts or updates a record into the FTS5 index.
   */
  public indexItem(item: {
    name: string;
    path: string;
    manifest_type?: string;
    content?: string;
  }): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO project_index (name, path, manifest_type, content)
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(
      item.name,
      item.path,
      item.manifest_type || '',
      item.content || ''
    );
  }

  /**
   * Bulk inserts multiple records in a single transaction for maximum indexing speed.
   */
  public bulkIndex(items: Array<{
    name: string;
    path: string;
    manifest_type?: string;
    content?: string;
  }>): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO project_index (name, path, manifest_type, content)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((records: typeof items) => {
      for (const rec of records) {
        insertStmt.run(
          rec.name,
          rec.path,
          rec.manifest_type || '',
          rec.content || ''
        );
      }
    });

    insertMany(items);
  }

  /**
   * Recursively crawls a directory for manifest files (.git/config, package.json, requirements.txt, Cargo.toml, go.mod)
   */
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
              } catch {
                // ignore unreadable
              }
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

          // Index folder itself
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
            } catch {
              // ignore
            }
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

  /**
   * Executes BM25 ranked search for find_path(query) per §3.2.
   * Typical latency budget: ≤10ms.
   */
  public findPath(query: string, limit = 10): SearchResult[] {
    const sanitized = query.trim().replace(/['"*]/g, '');
    if (!sanitized) return [];

    // Construct FTS5 query with prefix match on each token
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

    try {
      const rows = stmt.all(ftsQuery, limit) as Array<{
        name: string;
        path: string;
        manifest_type: string;
        score: number;
      }>;
      return rows.map(r => ({
        name: r.name,
        path: r.path,
        manifest_type: r.manifest_type,
        score: Math.abs(r.score),
      }));
    } catch {
      // Fallback to simple LIKE query if FTS syntax error
      const fallbackStmt = this.db.prepare(`
        SELECT name, path, manifest_type, 0.0 as score
        FROM project_index
        WHERE name LIKE ? OR path LIKE ?
        LIMIT ?
      `);
      const pattern = `%${sanitized}%`;
      return fallbackStmt.all(pattern, pattern, limit) as SearchResult[];
    }
  }

  public close(): void {
    this.db.close();
  }
}
