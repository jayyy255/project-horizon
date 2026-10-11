import { contextBridge, ipcRenderer } from 'electron';
import { Tier2ActionPayload, WorkspaceChatRequest, ContextAttachment } from '../shared/types';

export interface DesktopCaptureData {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
  traceId?: string;
}

contextBridge.exposeInMainWorld('horizonAPI', {
  chooseAttachments: () => ipcRenderer.invoke('horizon:choose-attachments'),
  openLatencyLogs: () => ipcRenderer.invoke('horizon:open-latency-logs'),
  getLatencyReport: (id: string) => ipcRenderer.invoke('horizon:get-latency-report', id),
  recordRenderLatency: (id: string, durationMs: number) => ipcRenderer.invoke('horizon:record-render-latency', id, durationMs),
  setFloatingState: (state: { completed: boolean; busy: boolean }) => ipcRenderer.invoke('horizon:set-floating-state', state),
  onFloatingNewChat: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('horizon:floating-new-chat', handler);
    return () => ipcRenderer.removeListener('horizon:floating-new-chat', handler);
  },
  getGeminiStatus: () => ipcRenderer.invoke('horizon:get-gemini-status'),
  saveGeminiKey: (key: string) => ipcRenderer.invoke('horizon:save-gemini-key', key),
  getWorkspaceRoots: () => ipcRenderer.invoke('horizon:get-workspace-roots'),
  addWorkspaceRoot: () => ipcRenderer.invoke('horizon:add-workspace-root'),
  getPerceptionHealth: () => ipcRenderer.invoke('horizon:get-perception-health'),
  captureDesktop: (targetWindowName?: string): Promise<DesktopCaptureData> => ipcRenderer.invoke('horizon:capture-desktop', targetWindowName),
  openTargetApp: (title?: string) => ipcRenderer.invoke('horizon:open-target-app', title),
  getDesktopSources: () => ipcRenderer.invoke('horizon:get-desktop-sources'),
  onDesktopCaptured: (callback: (data: DesktopCaptureData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DesktopCaptureData) => callback(data);
    ipcRenderer.on('horizon:desktop-captured', handler);
    return () => ipcRenderer.removeListener('horizon:desktop-captured', handler);
  },
  toggleOverlay: () => ipcRenderer.invoke('horizon:toggle-overlay'),
  closeOverlay: () => ipcRenderer.invoke('horizon:close-overlay'),
  onOverlayToggled: (callback: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('horizon:overlay-toggled', handler);
    return () => ipcRenderer.removeListener('horizon:overlay-toggled', handler);
  },
  attachArea: (data: any) => ipcRenderer.invoke('horizon:attach-area', data),
  onAreaAttached: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('horizon:area-attached', handler);
    return () => ipcRenderer.removeListener('horizon:area-attached', handler);
  },
  triggerTier2: (payload: Tier2ActionPayload) => ipcRenderer.invoke('horizon:trigger-tier2', payload),
  onTier2Requested: (callback: (payload: Tier2ActionPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Tier2ActionPayload) => callback(payload);
    ipcRenderer.on('horizon:tier2-requested', handler);
    return () => ipcRenderer.removeListener('horizon:tier2-requested', handler);
  },
  sendTier2Decision: (actionId: string, authorized: boolean) =>
    ipcRenderer.invoke('horizon:tier2-decision', { actionId, authorized }),
  getSystemInfo: () => ipcRenderer.invoke('horizon:get-system-info'),

  // Step 4c: In-process agent coordinator IPC
  executeTask: (payload: { prompt: string; sessionId?: string; images?: string[]; history?: Array<{role: 'user' | 'assistant'; text: string}>; attachments?: ContextAttachment[] }) =>
    ipcRenderer.invoke('horizon:execute-task', payload),
  resolveTier2: (payload: { actionId: string; authorized: boolean }) =>
    ipcRenderer.invoke('horizon:resolve-tier2', payload),
  getAgentState: () => ipcRenderer.invoke('horizon:get-agent-state'),
  searchIndexer: (payload: { query: string; limit?: number }) =>
    ipcRenderer.invoke('horizon:search-indexer', payload),
  onAgentStateUpdate: (callback: (state: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: any) => callback(state);
    ipcRenderer.on('horizon:agent-state-update', handler);
    return () => ipcRenderer.removeListener('horizon:agent-state-update', handler);
  },
  onPanicAbort: (callback: (panicEvent: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, panicEvent: any) => callback(panicEvent);
    ipcRenderer.on('horizon:panic-abort', handler);
    return () => ipcRenderer.removeListener('horizon:panic-abort', handler);
  },
  sendCursorPosition: (pos: { x: number; y: number }) => ipcRenderer.send('horizon:cursor-position', pos),
  sendKeyPress: (key: string) => ipcRenderer.send('horizon:key-press', key),
  getCircuitBreakerState: (model: string) => ipcRenderer.invoke('horizon:get-circuit-breaker-state', model),
  setEnvVar: (key: string, value: string) => ipcRenderer.invoke('horizon:set-env-var', { key, value }),
  resetCircuitBreaker: (model?: string) => ipcRenderer.invoke('horizon:reset-circuit-breaker', model),
  approveHotkey: (hotkey?: string) => ipcRenderer.invoke('horizon:approve-hotkey', hotkey),
  getHotkeyStatus: () => ipcRenderer.invoke('horizon:get-hotkey-status'),
  onHotkeyStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on('horizon:hotkey-status', handler);
    return () => ipcRenderer.removeListener('horizon:hotkey-status', handler);
  },
  openMainWindow: (request?: WorkspaceChatRequest) => ipcRenderer.invoke('horizon:open-main-window', request),
  onWorkspaceChatRequested: (callback: (request: WorkspaceChatRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: WorkspaceChatRequest) => callback(request);
    ipcRenderer.on('horizon:workspace-chat-requested', handler);
    return () => ipcRenderer.removeListener('horizon:workspace-chat-requested', handler);
  },
  hideFloatingBar: () => ipcRenderer.invoke('horizon:hide-floating-bar'),
  resizeFloatingBar: (height: number) => ipcRenderer.invoke('horizon:resize-floating-bar', height),
  toggleFloatingBar: () => ipcRenderer.invoke('horizon:toggle-floating-bar'),
  triggerCapture: () => ipcRenderer.invoke('horizon:trigger-capture'),
});

