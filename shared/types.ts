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

export interface HorizonAPI {
  toggleOverlay: () => Promise<void>;
  closeOverlay: () => Promise<void>;
  onOverlayToggled: (callback: (visible: boolean) => void) => () => void;
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
