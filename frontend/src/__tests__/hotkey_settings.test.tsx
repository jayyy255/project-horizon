import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPreferencesSuite } from '../components/SettingsPreferencesSuite';
const inactive = { approved: true, active: false, accelerator: 'Super+Shift+C', label: 'Win + Shift + C', error: 'This shortcut is unavailable.' };
beforeEach(() => { localStorage.clear(); });
afterEach(() => { delete window.horizonAPI; });
describe('Actual shortcut registration status', () => {
  it('shows a registration conflict instead of claiming the saved shortcut is active', async () => {
    window.horizonAPI = { getHotkeyStatus: vi.fn().mockResolvedValue(inactive) } as any;
    render(<SettingsPreferencesSuite isDarkMode />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unavailable'));
    expect(screen.getByRole('status').textContent).toBe('Not active');
    expect(screen.getByRole('button', { name: 'Enable shortcut' })).toBeDefined();
  });
  it('keeps the previous shortcut displayed when another selection fails', async () => {
    window.horizonAPI = { getHotkeyStatus: vi.fn().mockResolvedValue({...inactive,active:true,error:undefined}), approveHotkey: vi.fn().mockResolvedValue({...inactive,active:true,success:false}) } as any;
    render(<SettingsPreferencesSuite isDarkMode />); await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Active across Windows'));
    fireEvent.click(screen.getByRole('button', { name: 'Cycle Hotkey' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unavailable'));
    expect(screen.getByText('Win + Shift + C')).toBeDefined(); expect(screen.queryByText('Ctrl + Space')).toBeNull();
  });
  it('cannot fake registration in a browser preview', async () => {
    render(<SettingsPreferencesSuite isDarkMode />); fireEvent.click(screen.getByRole('button', { name: 'Cycle Hotkey' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('desktop app'));
    expect(localStorage.getItem('horizon_hotkey')).toBeNull();
  });
});
