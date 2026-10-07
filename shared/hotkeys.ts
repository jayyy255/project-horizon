export const HOTKEY_OPTIONS = [
  { accelerator: 'Super+Shift+C', label: 'Win + Shift + C' },
  { accelerator: 'CommandOrControl+Space', label: 'Ctrl + Space' },
  { accelerator: 'CommandOrControl+Alt+H', label: 'Ctrl + Alt + H' },
] as const;

export interface HotkeyStatus {
  approved: boolean;
  active: boolean;
  accelerator: string;
  label: string;
  error?: string;
}

export interface HotkeyResult extends HotkeyStatus { success: boolean; }
