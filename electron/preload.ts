import { contextBridge, ipcRenderer } from 'electron';
import { Tier2ActionPayload } from '../shared/types';

export interface DesktopCaptureData {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
}

contextBridge.exposeInMainWorld('horizonAPI', {
  captureDesktop: (): Promise<DesktopCaptureData> => ipcRenderer.invoke('horizon:capture-desktop'),
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
  triggerTier2: (payload: Tier2ActionPayload) => ipcRenderer.invoke('horizon:trigger-tier2', payload),
  onTier2Requested: (callback: (payload: Tier2ActionPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Tier2ActionPayload) => callback(payload);
    ipcRenderer.on('horizon:tier2-requested', handler);
    return () => ipcRenderer.removeListener('horizon:tier2-requested', handler);
  },
  sendTier2Decision: (actionId: string, authorized: boolean) =>
    ipcRenderer.invoke('horizon:tier2-decision', { actionId, authorized }),
  getSystemInfo: () => ipcRenderer.invoke('horizon:get-system-info'),
});
