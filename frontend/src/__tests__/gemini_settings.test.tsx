import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPreferencesSuite } from '../components/SettingsPreferencesSuite';

afterEach(() => { delete window.horizonAPI; });
describe('Installer Gemini setup', () => {
  it('saves through desktop IPC without retaining the key in the input or local storage', async () => {
    const save = vi.fn().mockResolvedValue({ configured: true });
    window.horizonAPI = { getGeminiStatus: vi.fn().mockResolvedValue({configured:false}), saveGeminiKey: save } as any;
    render(<SettingsPreferencesSuite isDarkMode />);
    fireEvent.click(screen.getByRole('button', {name:'Inference Engine'}));
    const input = screen.getByLabelText('Gemini API key');
    const fixture = 'AIza' + 'synthetic'.repeat(5);
    fireEvent.change(input, {target:{value:fixture}});
    fireEvent.click(screen.getByRole('button', {name:'Save key'}));
    await waitFor(() => expect(save).toHaveBeenCalledWith(fixture));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    expect(screen.getByText('Configured')).toBeDefined();
    expect(JSON.stringify(localStorage)).not.toContain(fixture);
    fireEvent.click(screen.getByRole('button', {name:'Remove key'}));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(''));
  });
  it('shows a save failure without claiming the key is configured', async () => {
    window.horizonAPI = { saveGeminiKey: vi.fn().mockRejectedValue(new Error('Encryption unavailable')) } as any;
    render(<SettingsPreferencesSuite isDarkMode />);
    fireEvent.click(screen.getByRole('button', {name:'Inference Engine'}));
    fireEvent.change(screen.getByLabelText('Gemini API key'), {target:{value:'fixture'}});
    fireEvent.click(screen.getByRole('button', {name:'Save key'}));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Encryption unavailable'));
    expect(screen.getByText('Setup needed')).toBeDefined();
  });
});
