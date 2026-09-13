import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SafetyGate } from './safety/gate.js';
import { ProjectIndexer } from './indexer/fts5_indexer.js';
import { InputSynthesizer } from './input/synthesizer.js';
import { AuditDatabase } from './audit/db.js';
import { AgentCoordinator, ReActSessionState } from './react/coordinator.js';

const app = express();
const port = process.env.PORT || 4100;

app.use(cors());
app.use(express.json());

// Initialize Core Subsystems
const safetyGate = new SafetyGate();
const projectIndexer = new ProjectIndexer('./horizon_index.db');
const auditDb = new AuditDatabase('./horizon_audit.db');

// Index current workspace
projectIndexer.indexDirectory(process.cwd());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws/hud' });

const broadcastState = (state: ReActSessionState) => {
  const msg = JSON.stringify({ type: 'state_update', data: state });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};

const inputSynthesizer = new InputSynthesizer({ width: 1920, height: 1080 }, (panicEvent) => {
  const panicMsg = JSON.stringify({ type: 'panic_abort', data: panicEvent });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(panicMsg);
    }
  });
});

const coordinator = new AgentCoordinator(
  safetyGate,
  projectIndexer,
  inputSynthesizer,
  auditDb,
  broadcastState
);

// --- REST Endpoints ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'horizon-agent-service',
    timestamp: Date.now(),
  });
});

// Start New Task Execution
app.post('/api/task/execute', async (req, res) => {
  const { prompt, sessionId } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const sid = sessionId || `sess-${Date.now()}`;
  try {
    const finalState = await coordinator.executeTask(sid, prompt);
    res.json(finalState);
  } catch (err: any) {
    console.error('[API /api/task/execute Error]:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Resolve Tier 2 Confirmation Decision
app.post('/api/task/tier2-decision', async (req, res) => {
  const { actionId, authorized } = req.body;
  if (!actionId || typeof authorized !== 'boolean') {
    return res.status(400).json({ error: 'actionId and boolean authorized are required' });
  }

  try {
    const updatedState = await coordinator.resolveTier2(actionId, authorized);
    res.json(updatedState);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get Active State
app.get('/api/task/state', (req, res) => {
  res.json(coordinator.getActiveState() || { status: 'idle' });
});

// Search Filesystem via FTS5
app.get('/api/indexer/search', (req, res) => {
  const query = String(req.query.q || '');
  const limit = Number(req.query.limit || 10);
  const results = projectIndexer.findPath(query, limit);
  res.json({ query, results });
});

// Session History
app.get('/api/audit/session/:id', (req, res) => {
  const session = auditDb.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const traces = auditDb.getToolTraces(req.params.id);
  res.json({ session, traces });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  const activeState = coordinator.getActiveState();
  if (activeState) {
    ws.send(JSON.stringify({ type: 'state_update', data: activeState }));
  }

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.type === 'cursor_move') {
        inputSynthesizer.checkCornerSlam(parsed.position);
      } else if (parsed.type === 'key_press') {
        inputSynthesizer.handleKeyEvent(parsed.key);
      }
    } catch {
      // ignore
    }
  });
});

export { app, httpServer, wss, coordinator };

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => {
    console.log(`[Horizon Agent Service] Microservice listening on http://localhost:${port}`);
    console.log(`[Horizon Agent Service] WebSocket server active on ws://localhost:${port}/ws/hud`);
  });
}
