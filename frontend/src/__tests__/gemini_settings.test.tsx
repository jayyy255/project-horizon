import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPreferencesSuite } from '../components/SettingsPreferencesSuite';

afterEach(() => { delete window.horizonAPI; });
describe('Installer Gemini setup', () => {
  it('uses Google sign-in for hosted access and exposes no API-key input', async () => {
    const signIn = vi.fn().mockResolvedValue({ configured: true, signedIn: true, hosted: true, email: 'approved@example.test' });
    const signOut = vi.fn().mockResolvedValue({ configured: false, signedIn: false, hosted: true });
    window.horizonAPI = { getGeminiStatus: vi.fn().mockResolvedValue({ configured: false, hosted: true }), signIn, signOut } as any;
    render(<SettingsPreferencesSuite isDarkMode />); fireEvent.click(screen.getByRole('button', { name: 'Inference Engine' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDefined());
    expect(screen.queryByLabelText('Gemini API key')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => expect(screen.getByText('Signed in as approved@example.test.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(JSON.stringify(localStorage)).not.toContain('approved@example.test');
  });
  it('keeps hosted access signed out after a failed Google login', async () => {
    window.horizonAPI = { getGeminiStatus: vi.fn().mockResolvedValue({ configured: false, hosted: true }), signIn: vi.fn().mockRejectedValue(new Error('Account not approved')) } as any;
    render(<SettingsPreferencesSuite isDarkMode />); fireEvent.click(screen.getByRole('button', { name: 'Inference Engine' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Account not approved'));
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
  it('does not ask friends for a key when owner access is included', async () => {
    window.horizonAPI = { getGeminiStatus: vi.fn().mockResolvedValue({configured:true,ownerProvided:true}) } as any;
    render(<SettingsPreferencesSuite isDarkMode />); fireEvent.click(screen.getByRole('button', {name:'Inference Engine'}));
    await waitFor(() => expect(screen.getByText('Gemini access included')).toBeDefined());
    expect(screen.queryByLabelText('Gemini API key')).toBeNull();
  });
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
