export const HOTKEY_OPTIONS = [
  { accelerator: 'Super+Shift+C', label: 'Win + Shift + C' },
  { accelerator: 'CommandOrControl+Space', label: 'Ctrl + Space' },
  { accelerator: 'CommandOrControl+Alt+H', label: 'Ctrl + Alt + H' },
] as const;

export const DEFAULT_HOTKEY = HOTKEY_OPTIONS[2];

export interface HotkeyStatus {
  approved: boolean;
  active: boolean;
  accelerator: string;
  label: string;
  error?: string;
  notice?: string;
}

export interface HotkeyResult extends HotkeyStatus { success: boolean; }
