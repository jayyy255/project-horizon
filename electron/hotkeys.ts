import fs from 'fs';
import path from 'path';
import { HOTKEY_OPTIONS, HotkeyStatus, HotkeyResult } from '../shared/hotkeys';

interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  isRegistered(accelerator: string): boolean;
  unregister(accelerator: string): void;
}

/** Main-process ownership and persistence; renderer storage is only migrated once. */
export class HotkeyManager {
  private approved = false;
  private accelerator: string = HOTKEY_OPTIONS[0].accelerator;
  private active: string | null = null;
  private error?: string;

  constructor(private file: string, private registry: ShortcutRegistry, private summon: () => void) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (HOTKEY_OPTIONS.some(option => option.accelerator === saved.accelerator)) {
        this.accelerator = saved.accelerator;
        this.approved = saved.approved === true;
      }
    } catch {}
  }

  getStatus(): HotkeyStatus {
    return { approved: this.approved, active: Boolean(this.active && this.registry.isRegistered(this.active)),
      accelerator: this.accelerator, label: HOTKEY_OPTIONS.find(option => option.accelerator === this.accelerator)!.label,
      error: this.error };
  }

  restore(): HotkeyStatus {
    if (this.approved) this.activate(this.accelerator, false);
    return this.getStatus();
  }

  approve(accelerator = this.accelerator): HotkeyResult {
    return this.activate(accelerator, true);
  }

  private activate(next: string, persist: boolean): HotkeyResult {
    if (!HOTKEY_OPTIONS.some(option => option.accelerator === next)) {
      return { ...this.getStatus(), success: false, error: 'Choose one of the supported shortcuts.' };
    }
    const previous = this.active;
    const alreadyActive = previous === next && this.registry.isRegistered(next);
    let registered = alreadyActive;
    let registrationError = '';
    try { if (!alreadyActive) registered = this.registry.register(next, this.summon); }
    catch { registrationError = 'Windows could not register this shortcut.'; }
    const accelerator = registered ? next : (previous || next);
    const approved = persist || this.approved;
    if (persist) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify({ approved, accelerator }), 'utf8');
      } catch {
        if (registered && !alreadyActive) this.registry.unregister(next);
        return { ...this.getStatus(), success: false, error: 'Could not save the shortcut. Please try again.' };
      }
    }
    this.approved = approved;
    this.accelerator = accelerator;
    if (registered) {
      this.active = next;
      if (previous && previous !== next) this.registry.unregister(previous);
      this.error = undefined;
    } else {
      this.error = registrationError || 'This shortcut is unavailable or used by another application. Choose another shortcut in Preferences.';
    }
    return { ...this.getStatus(), success: registered };
  }
}
