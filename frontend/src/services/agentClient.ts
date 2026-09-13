import { Tier2ActionPayload } from '@shared/types';

export interface ReActStep {
  stepIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  narration: string;
  tier: 1 | 2;
  status: 'pending' | 'in-progress' | 'succeeded' | 'failed';
  result?: unknown;
  durationMs?: number;
  reasoning?: string;
}

export interface ReActSessionState {
  sessionId: string;
  taskPrompt: string;
  status: 'idle' | 'working' | 'done' | 'error' | 'awaiting_tier2';
  currentNarration: string;
  currentTool?: string;
  steps: ReActStep[];
  pendingTier2?: Tier2ActionPayload;
}

export interface AgentServiceConfig {
  httpBaseUrl: string;
  wsUrl: string;
}

const DEFAULT_CONFIG: AgentServiceConfig = {
  httpBaseUrl: 'http://localhost:4100',
  wsUrl: 'ws://localhost:4100/ws/hud',
};

export class AgentClient {
  private config: AgentServiceConfig;
  private ws: WebSocket | null = null;
  private onStateCallback?: (state: ReActSessionState) => void;
  private onStatusChange?: (connected: boolean) => void;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: Partial<AgentServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public connect(
    onState: (state: ReActSessionState) => void,
    onStatus: (connected: boolean) => void
  ): void {
    this.onStateCallback = onState;
    this.onStatusChange = onStatus;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (typeof window === 'undefined') return;

    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        this.onStatusChange?.(true);
      };

      this.ws.onclose = () => {
        this.onStatusChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.onStatusChange?.(false);
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'state_update' && payload.data) {
            this.onStateCallback?.(payload.data);
          }
        } catch {
          // ignore malformed message
        }
      };
    } catch {
      this.onStatusChange?.(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.initWebSocket();
    }, 3000);
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChange?.(false);
  }

  public async checkHealth(): Promise<{ status: string; service: string }> {
    const res = await fetch(`${this.config.httpBaseUrl}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    return res.json();
  }

  public async executeTask(prompt: string, sessionId?: string): Promise<ReActSessionState> {
    const res = await fetch(`${this.config.httpBaseUrl}/api/task/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  public async resolveTier2(actionId: string, authorized: boolean): Promise<ReActSessionState> {
    const res = await fetch(`${this.config.httpBaseUrl}/api/task/tier2-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, authorized }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  public async searchIndexer(query: string, limit = 10): Promise<any[]> {
    const res = await fetch(`${this.config.httpBaseUrl}/api/indexer/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }
}

export const agentClient = new AgentClient();
