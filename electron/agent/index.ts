import { ipcMain, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { SafetyGate } from './gate';
import { ProjectIndexer } from './indexer';
import { InputSynthesizer } from './synthesizer';
import { AuditDatabase } from './db';
import { AgentCoordinator, ReActSessionState } from './coordinator';
import { agentDataPath } from './sqlite';
import { discoverWorkspaceRoots } from './workspaces';

export class AgentHost {
  private coordinator: AgentCoordinator;
  private safetyGate: SafetyGate;
  private projectIndexer: ProjectIndexer;
  private inputSynthesizer: InputSynthesizer;
  private auditDb: AuditDatabase;
  private mainWindow: BrowserWindow | null = null;
  private workspaceRoots: string[] = discoverWorkspaceRoots();

  constructor() {
    this.safetyGate = new SafetyGate();
    this.projectIndexer = new ProjectIndexer(agentDataPath('horizon_index.db'));
    this.auditDb = new AuditDatabase(agentDataPath('horizon_audit.db'));

    try {
      const roots = JSON.parse(fs.readFileSync(agentDataPath('workspace-roots.json'), 'utf8'));
      if (Array.isArray(roots) && roots.length && roots.every(root => typeof root === 'string')) this.workspaceRoots = roots;
    } catch {}
    // Automatically index configured workspaces.
    try {
      for (const root of this.workspaceRoots) this.projectIndexer.indexDirectory(root, root === process.cwd() ? 3 : 1);
    } catch (e) {
      console.warn('[AgentHost] Project directory indexing warning:', e);
    }

    this.inputSynthesizer = new InputSynthesizer({ width: 1920, height: 1080 }, (panicEvent) => {
      console.log('[AgentHost] Hardware Panic Kill-Switch Triggered:', panicEvent);
      this.coordinator?.abortSession('Execution halted by Hardware Panic Kill-Switch.');
      this.mainWindow?.webContents.send('horizon:panic-abort', panicEvent);
    });

    this.coordinator = new AgentCoordinator(
      this.safetyGate,
      this.projectIndexer,
      this.inputSynthesizer,
      this.auditDb,
      (state: ReActSessionState) => {
        this.broadcastState(state);
      }
    );

    this.registerIpcHandlers();
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private broadcastState(state: ReActSessionState): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('horizon:agent-state-update', state);
    }
  }

  private registerIpcHandlers(): void {
    if (!ipcMain?.handle) return;
    ipcMain.handle('horizon:get-workspace-roots', () => this.workspaceRoots);
    ipcMain.handle('horizon:add-workspace-root', async () => {
      const selection = await dialog.showOpenDialog({ title: 'Choose a workspace to index', properties: ['openDirectory'] });
      if (!selection.canceled && selection.filePaths[0]) {
        const root = selection.filePaths[0];
        if (!this.workspaceRoots.includes(root)) {
          this.projectIndexer.indexDirectory(root, 3);
          this.workspaceRoots.push(root);
          fs.writeFileSync(agentDataPath('workspace-roots.json'), JSON.stringify(this.workspaceRoots));
        }
      }
      return this.workspaceRoots;
    });
    ipcMain.handle('horizon:get-perception-health', async () => {
      try {
        const response = await fetch('http://127.0.0.1:4200/health', { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Perception service is unavailable');
        return await response.json();
      } catch { return { status: 'offline' }; }
    });
    // 1. Execute task
    ipcMain.handle('horizon:execute-task', async (_event, payload: { prompt: string; sessionId?: string; images?: string[]; history?: Array<{role: 'user' | 'assistant'; text: string}> }) => {
      const sessionId = payload.sessionId || `sess-${Date.now()}`;
      try {
        console.log(`[AgentHost] Executing task: "${payload.prompt}" (Session: ${sessionId}, Images: ${payload.images?.length || 0})`);
        return await this.coordinator.executeTask(sessionId, payload.prompt, undefined, payload.images, payload.history);
      } catch (err: any) {
        console.error('[AgentHost] Execute task error:', err);
        throw err;
      }
    });

    // 2. Resolve Tier 2 HITL Confirmation
    ipcMain.handle('horizon:resolve-tier2', async (_event, payload: { actionId: string; authorized: boolean }) => {
      console.log(`[AgentHost] Resolving Tier 2 action ${payload.actionId}: authorized=${payload.authorized}`);
      return await this.coordinator.resolveTier2(payload.actionId, payload.authorized);
    });

    // 3. Get Active Agent State
    ipcMain.handle('horizon:get-agent-state', () => {
      return this.coordinator.getActiveState() || { status: 'idle' };
    });

    // 4. Search Local Workspace via FTS5 Indexer
    ipcMain.handle('horizon:search-indexer', (_event, payload: { query: string; limit?: number }) => {
      return this.projectIndexer.findPath(payload.query, payload.limit || 10);
    });

    // 5. Get Session & Traces
    ipcMain.handle('horizon:get-audit-session', (_event, sessionId: string) => {
      const session = this.auditDb.getSession(sessionId);
      const traces = this.auditDb.getToolTraces(sessionId);
      return { session, traces };
    });

    // 6. Direct Input Synthesizer events
    ipcMain.on('horizon:cursor-position', (_event, pos: { x: number; y: number }) => {
      this.inputSynthesizer.checkCornerSlam(pos);
    });

    ipcMain.on('horizon:key-press', (_event, key: string) => {
      this.inputSynthesizer.handleKeyEvent(key);
    });

    // 7. Circuit breaker state
    ipcMain.handle('horizon:get-circuit-breaker-state', (_event, model: string) => {
      return this.coordinator.getModelRouter().getCircuitBreaker().getState(model);
    });

    // 8. Environment variable override (for live circuit breaker failure testing)
    ipcMain.handle('horizon:set-env-var', (_event, payload: { key: string; value: string }) => {
      process.env[payload.key] = payload.value;
      return true;
    });

    // 9. Circuit breaker reset
    ipcMain.handle('horizon:reset-circuit-breaker', (_event, model?: string) => {
      this.coordinator.getModelRouter().getCircuitBreaker().reset(model);
      return true;
    });
  }

  public getCoordinator(): AgentCoordinator {
    return this.coordinator;
  }

  public close(): void {
    this.projectIndexer.close();
    this.auditDb.close();
  }
}

export { ReflexiveMatcher } from './reflexive';
export { ModelRouter, ModelCircuitBreaker } from './router';
export { CommandCache } from './cache';

