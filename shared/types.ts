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
}

export interface HorizonAPI {
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
}

declare global {
  interface Window {
    horizonAPI?: HorizonAPI;
  }
}
