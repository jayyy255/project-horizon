import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

export interface GraphNode {
  id: string;
  type: 'app' | 'project' | 'workspace' | 'directory' | 'protocol' | 'service';
  name: string;
  path?: string;
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: 'OPENS_WORKSPACE' | 'CONTAINS' | 'REGISTERED_TO' | 'DEPENDS_ON' | 'ACTIVE_IN';
  metadata?: Record<string, unknown>;
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

export class SystemKnowledgeGraph {
  private db: any = null;
  private inMemoryNodes: Map<string, GraphNode> = new Map();
  private inMemoryEdges: GraphEdge[] = [];

  constructor(dbPath: string = ':memory:') {
    const Sqlite = resolveSqlite();
    if (Sqlite) {
      try {
        if (dbPath !== ':memory:') {
          const dir = path.dirname(dbPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Sqlite(dbPath);
        this.initSchema();
      } catch {
        this.db = null;
      }
    }

    // Auto-discover local applications, protocols, and editor workspaces
    this.discoverSystemEntities();
  }

  private initSchema(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT,
        metadata TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS graph_edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        metadata TEXT,
        PRIMARY KEY (source_id, target_id, relation),
        FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON graph_nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(sourceId);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(targetId);
    `);
  }

  public upsertNode(node: GraphNode): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO graph_nodes (id, type, name, path, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          path = excluded.path,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `);
      stmt.run(
        node.id,
        node.type,
        node.name,
        node.path || null,
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.updatedAt || Date.now()
      );
    } else {
      this.inMemoryNodes.set(node.id, node);
    }
  }

  public addEdge(edge: GraphEdge): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO graph_edges (source_id, target_id, relation, metadata)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(
        edge.sourceId,
        edge.targetId,
        edge.relation,
        edge.metadata ? JSON.stringify(edge.metadata) : null
      );
    } else {
      this.inMemoryEdges = this.inMemoryEdges.filter(
        e => !(e.sourceId === edge.sourceId && e.targetId === edge.targetId && e.relation === edge.relation)
      );
      this.inMemoryEdges.push(edge);
    }
  }

  public getNode(id: string): GraphNode | null {
    if (this.db) {
      const row = this.db.prepare('SELECT * FROM graph_nodes WHERE id = ?').get(id);
      if (!row) return null;
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        path: row.path,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        updatedAt: row.updated_at,
      };
    }
    return this.inMemoryNodes.get(id) || null;
  }

  public findNodesByNameOrType(query: string): GraphNode[] {
    const q = query.toLowerCase().trim();
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM graph_nodes 
        WHERE LOWER(name) LIKE ? OR LOWER(type) LIKE ? OR LOWER(id) LIKE ?
      `).all(`%${q}%`, `%${q}%`, `%${q}%`);
      return rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        path: r.path,
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(this.inMemoryNodes.values()).filter(
      n => n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    );
  }

  /**
   * Scans system for installed apps, known protocol associations, and editor workspaces.
   */
  public discoverSystemEntities(): void {
    const now = Date.now();
    const localAppData = process.env.LOCALAPPDATA || 'C:/Users/Jay/AppData/Local';
    const appData = process.env.APPDATA || 'C:/Users/Jay/AppData/Roaming';

    // 1. WhatsApp
    this.upsertNode({
      id: 'app:whatsapp',
      type: 'app',
      name: 'WhatsApp',
      path: 'whatsapp:',
      metadata: { protocol: 'whatsapp:', uwpPackage: '5319275A.WhatsAppDesktop' },
      updatedAt: now,
    });

    // 2. Spotify
    const spotifyAppPath = path.join(appData, 'Spotify', 'Spotify.exe');
    this.upsertNode({
      id: 'app:spotify',
      type: 'app',
      name: 'Spotify',
      path: fs.existsSync(spotifyAppPath) ? spotifyAppPath : 'spotify:',
      metadata: {
        protocol: 'spotify:',
        appxPackage: 'SpotifyAB.SpotifyMusic',
        exePath: spotifyAppPath,
      },
      updatedAt: now,
    });

    // 3. Visual Studio Code
    const vscodeExe = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe');
    this.upsertNode({
      id: 'app:vscode',
      type: 'app',
      name: 'Visual Studio Code',
      path: fs.existsSync(vscodeExe) ? vscodeExe : 'code',
      metadata: {
        command: 'code',
        exePath: vscodeExe,
      },
      updatedAt: now,
    });

    // 4. Discover VS Code Active/Recent Workspaces from Local Config
    try {
      const storageJsonPath = path.join(appData, 'Code', 'User', 'globalStorage', 'storage.json');
      if (fs.existsSync(storageJsonPath)) {
        const content = JSON.parse(fs.readFileSync(storageJsonPath, 'utf8'));
        const folders = content.backupWorkspaces?.folders || [];
        for (const item of folders) {
          if (item.folderUri) {
            const cleanPath = decodeURIComponent(item.folderUri.replace('file:///', ''));
            const folderName = path.basename(cleanPath);
            const projectId = `project:${folderName.toLowerCase()}`;

            this.upsertNode({
              id: projectId,
              type: 'project',
              name: folderName,
              path: cleanPath,
              metadata: { source: 'vscode_backup_workspaces' },
              updatedAt: now,
            });

            this.addEdge({
              sourceId: 'app:vscode',
              targetId: projectId,
              relation: 'OPENS_WORKSPACE',
              metadata: { active: true },
            });
          }
        }
      }
    } catch {
      // Ignore config read failures
    }

    // 5. Index Common Parent Directories
    if (fs.existsSync('E:/code/projects')) {
      this.upsertNode({
        id: 'dir:code_projects',
        type: 'directory',
        name: 'Projects Root',
        path: 'E:/code/projects',
        metadata: { drive: 'E:' },
        updatedAt: now,
      });

      this.addEdge({
        sourceId: 'dir:code_projects',
        targetId: 'project:project-horizon',
        relation: 'CONTAINS',
      });
    }
  }

  /**
   * Resolves the open folder/workspace for a given application (e.g. 'vscode').
   */
  public getOpenWorkspace(appName: string = 'vscode'): { folderPath: string; folderName: string; source: string } | null {
    // 1. Check graph edges
    const appId = appName.toLowerCase().includes('code') ? 'app:vscode' : `app:${appName.toLowerCase()}`;
    const node = this.getNode(appId);

    if (appId === 'app:vscode') {
      try {
        const appData = process.env.APPDATA || 'C:/Users/Jay/AppData/Roaming';
        const storagePath = path.join(appData, 'Code', 'User', 'globalStorage', 'storage.json');
        if (fs.existsSync(storagePath)) {
          const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
          const folders = data.backupWorkspaces?.folders || [];
          if (folders.length > 0 && folders[0].folderUri) {
            const rawPath = decodeURIComponent(folders[0].folderUri.replace('file:///', ''));
            return {
              folderPath: rawPath,
              folderName: path.basename(rawPath),
              source: 'VS Code globalStorage/storage.json',
            };
          }
        }
      } catch {}
    }

    if (node) {
      const nodes = this.findNodesByNameOrType('project');
      if (nodes.length > 0) {
        return {
          folderPath: nodes[0].path || '',
          folderName: nodes[0].name,
          source: 'SystemKnowledgeGraph edge',
        };
      }
    }

    return null;
  }

  /**
   * Resolves application launcher target and protocol
   */
  public resolveAppLaunchTarget(appQuery: string): { target: string; args: string[]; name: string } | null {
    const q = appQuery.toLowerCase().trim();

    if (q.includes('spotify')) {
      return {
        target: 'start spotify:',
        args: [],
        name: 'Spotify',
      };
    }

    if (q.includes('whatsapp')) {
      return {
        target: 'start whatsapp:',
        args: [],
        name: 'WhatsApp',
      };
    }

    if (q.includes('code') || q.includes('vscode')) {
      const localAppData = process.env.LOCALAPPDATA || 'C:/Users/Jay/AppData/Local';
      const userVsCode = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe');
      return {
        target: fs.existsSync(userVsCode) ? `"${userVsCode}"` : 'code',
        args: [],
        name: 'Visual Studio Code',
      };
    }

    // Try graph lookup
    const matches = this.findNodesByNameOrType(q);
    const appNode = matches.find(m => m.type === 'app' || m.type === 'protocol');
    if (appNode && appNode.path) {
      return {
        target: appNode.path.startsWith('start ') || !appNode.path.includes(':') ? appNode.path : `start ${appNode.path}`,
        args: [],
        name: appNode.name,
      };
    }

    return null;
  }

  /**
   * Returns statistics for HUD card presentation
   */
  public getStats(): { nodes: number; edges: number; label: string } {
    let nodes = 0;
    let edges = 0;

    if (this.db) {
      nodes = this.db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get()?.count || 0;
      edges = this.db.prepare('SELECT COUNT(*) as count FROM graph_edges').get()?.count || 0;
    } else {
      nodes = this.inMemoryNodes.size;
      edges = this.inMemoryEdges.length;
    }

    return {
      nodes,
      edges,
      label: 'Local System Knowledge & Workspace Graph',
    };
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}
