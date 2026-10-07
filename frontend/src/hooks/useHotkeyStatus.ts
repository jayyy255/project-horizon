import { useCallback, useEffect, useState } from 'react';
import { HOTKEY_OPTIONS, HotkeyStatus } from '@shared/hotkeys';

export function useHotkeyStatus() {
  const [status, setStatus] = useState<HotkeyStatus>({ approved: false, active: false, ...HOTKEY_OPTIONS[0] });
  const [loading, setLoading] = useState(Boolean(window.horizonAPI?.getHotkeyStatus));
  const [error, setError] = useState('');
  const update = useCallback((next: HotkeyStatus) => {
    setStatus(next); setError(next.error || '');
    if (next.approved) {
      localStorage.setItem('horizon_hotkey_approved', 'true');
      localStorage.setItem('horizon_hotkey', next.label);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const unsubscribe = window.horizonAPI?.onHotkeyStatus?.(next => { if (alive) update(next); });
    window.horizonAPI?.getHotkeyStatus?.().then(next => { if (alive) update(next); })
      .catch(() => { if (alive) setError('Could not check the shortcut. Open Preferences to retry.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; unsubscribe?.(); };
  }, [update]);
  const register = async (accelerator?: string) => {
    if (!window.horizonAPI?.approveHotkey) throw new Error('Global shortcuts require the desktop app.');
    const result = await window.horizonAPI.approveHotkey(accelerator);
    update(result);
    return result;
  };
  return { status, loading, error, register };
}
