import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { SafetyGate } from './gate';
import { ProjectIndexer } from './indexer';
import { InputSynthesizer } from './synthesizer';
import { AuditDatabase } from './db';
import { AgentCoordinator, ReActSessionState } from './coordinator';

export class AgentHost {
  private coordinator: AgentCoordinator;
  private safetyGate: SafetyGate;
  private projectIndexer: ProjectIndexer;
  private inputSynthesizer: InputSynthesizer;
  private auditDb: AuditDatabase;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.safetyGate = new SafetyGate();
    this.projectIndexer = new ProjectIndexer(path.join(process.cwd(), 'horizon_index.db'));
    this.auditDb = new AuditDatabase(path.join(process.cwd(), 'horizon_audit.db'));

    // Automatically index current workspace tree
    try {
      this.projectIndexer.indexDirectory(process.cwd(), 3);
    } catch (e) {
      console.warn('[AgentHost] Project directory indexing warning:', e);
    }

    this.inputSynthesizer = new InputSynthesizer({ width: 1920, height: 1080 }, (panicEvent) => {
      console.log('[AgentHost] Hardware Panic Kill-Switch Triggered:', panicEvent);
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
    // 1. Execute task
    ipcMain.handle('horizon:execute-task', async (_event, payload: { prompt: string; sessionId?: string; images?: string[] }) => {
      const sessionId = payload.sessionId || `sess-${Date.now()}`;
      try {
        console.log(`[AgentHost] Executing task: "${payload.prompt}" (Session: ${sessionId}, Images: ${payload.images?.length || 0})`);
        return await this.coordinator.executeTask(sessionId, payload.prompt, undefined, payload.images);
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

