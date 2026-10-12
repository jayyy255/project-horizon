import type { HotkeyResult, HotkeyStatus } from './hotkeys';

export interface LatencyStage { name: string; durationMs: number; status: 'ok' | 'error'; }
export interface LatencyReport { id: string; source: string; stages: LatencyStage[]; totalMs: number; }
export interface ContextAttachment {
  id: string;
  label: string;
  type: 'crop' | 'fullscreen' | 'image' | 'pdf' | 'file';
  croppedDataUrl?: string;
  coords?: BoundingBox;
  timestamp?: number;
  documentId?: string;
  traceId?: string;
  safety?: string;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TaggedElement {
  tag_id: number;
  coords: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  center: [number, number]; // [x, y]
  type: 'button' | 'input' | 'text' | 'icon' | 'list_row' | 'container';
  label: string;
  confidence?: number;
}

export interface Tier2ActionPayload {
  actionId: string;
  description: string;
  command?: string;
  executablePath?: string;
  args?: string[];
  targetPath?: string;
  isDestructive: boolean;
  timestamp: number;
}

export interface DesktopCaptureData {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
  traceId?: string;
}

export interface WorkspaceChatRequest {
  newChat: true;
  draft?: string;
  attachments?: ContextAttachment[];
}

export interface HorizonAPI {
  chooseAttachments?: () => Promise<ContextAttachment[]>;
  openLatencyLogs?: () => Promise<void>;
  getLatencyReport?: (id: string) => Promise<LatencyReport | null>;
  recordRenderLatency?: (id: string, durationMs: number) => Promise<void>;
  setFloatingState?: (state: { completed: boolean; busy: boolean }) => Promise<void>;
  onFloatingNewChat?: (callback: () => void) => () => void;
  getGeminiStatus?: () => Promise<{ configured: boolean; ownerProvided?: boolean; hosted?: boolean; signedIn?: boolean; signingIn?: boolean; email?: string }>;
  signIn?: () => Promise<{ configured: boolean; hosted?: boolean; signedIn?: boolean; signingIn?: boolean; email?: string }>;
  cancelSignIn?: () => Promise<void>;
  signOut?: () => Promise<{ configured: boolean; hosted?: boolean; signedIn?: boolean; signingIn?: boolean; email?: string }>;
  onAccountStatus?: (callback: (status: { signedIn: boolean; signingIn: boolean; email?: string }) => void) => () => void;
  saveGeminiKey?: (key: string) => Promise<{ configured: boolean; ownerProvided?: boolean }>;
  getWorkspaceRoots?: () => Promise<string[]>;
  addWorkspaceRoot?: () => Promise<string[]>;
  getPerceptionHealth?: () => Promise<{ status: string; backend?: string }>;
  captureDesktop: () => Promise<DesktopCaptureData>;
  getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;
  onDesktopCaptured: (callback: (data: DesktopCaptureData) => void) => () => void;
  toggleOverlay: () => Promise<boolean>;
  closeOverlay: () => Promise<boolean>;
  onOverlayToggled: (callback: (visible: boolean) => void) => () => void;
  attachArea: (data: any) => Promise<boolean>;
  onAreaAttached: (callback: (data: any) => void) => () => void;
  triggerTier2: (payload: Tier2ActionPayload) => Promise<void>;
  onTier2Requested: (callback: (payload: Tier2ActionPayload) => void) => () => void;
  sendTier2Decision: (actionId: string, authorized: boolean) => Promise<void>;
  getSystemInfo: () => Promise<SystemInfo>;
  // In-process ReAct Agent methods (Step 4c)
  executeTask: (payload: { prompt: string; sessionId?: string; images?: string[]; history?: Array<{role: 'user' | 'assistant'; text: string}>; attachments?: ContextAttachment[] }) => Promise<any>;
  resolveTier2: (payload: { actionId: string; authorized: boolean }) => Promise<any>;
  getAgentState: () => Promise<any>;
  searchIndexer: (payload: { query: string; limit?: number }) => Promise<any[]>;
  onAgentStateUpdate: (callback: (state: any) => void) => () => void;
  onPanicAbort: (callback: (panicEvent: any) => void) => () => void;
  approveHotkey?: (hotkey?: string) => Promise<HotkeyResult>;
  getHotkeyStatus?: () => Promise<HotkeyStatus>;
  onHotkeyStatus?: (callback: (status: HotkeyStatus) => void) => () => void;
  openMainWindow?: (request?: WorkspaceChatRequest) => Promise<void>;
  onWorkspaceChatRequested?: (callback: (request: WorkspaceChatRequest) => void) => () => void;
  hideFloatingBar?: () => Promise<void>;
  resizeFloatingBar?: (height: number) => Promise<void>;
  toggleFloatingBar?: () => Promise<void>;
  triggerCapture?: () => Promise<boolean>;
}

declare global {
  interface Window {
    horizonAPI?: HorizonAPI;
  }
}

