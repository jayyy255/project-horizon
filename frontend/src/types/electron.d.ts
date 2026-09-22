export interface DesktopCaptureData {
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  sourceId: string;
  displayLabel: string;
}

export interface HorizonAPI {
  captureDesktop: () => Promise<DesktopCaptureData>;
  getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;
  onDesktopCaptured: (callback: (data: DesktopCaptureData) => void) => () => void;
  toggleOverlay: () => Promise<boolean>;
  closeOverlay: () => Promise<boolean>;
  onOverlayToggled: (callback: (visible: boolean) => void) => () => void;
  triggerTier2: (payload: any) => Promise<void>;
  onTier2Requested: (callback: (payload: any) => void) => () => void;
  sendTier2Decision: (actionId: string, authorized: boolean) => Promise<void>;
  getSystemInfo: () => Promise<any>;
}

declare global {
  interface Window {
    horizonAPI?: HorizonAPI;
  }
}
