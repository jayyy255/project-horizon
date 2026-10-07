import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FloatingBarWindow } from '../components/FloatingBarWindow';
const mock = vi.hoisted(() => ({ dispatch: vi.fn(), decide: vi.fn(), state: null as any }));
vi.mock('../hooks/useHorizonAgent', () => ({ useHorizonAgent: () => ({ sessionState: mock.state, dispatchTask: mock.dispatch, submitTier2Decision: mock.decide }) }));
const answer = (text: string, status = 'done') => ({ sessionId: 'agent-test', taskPrompt: 'question', status, currentNarration: text, steps: [] });
beforeEach(() => { localStorage.clear(); mock.state = null; mock.dispatch.mockReset(); mock.decide.mockReset(); window.horizonAPI = { openMainWindow: vi.fn() } as any; });
afterEach(() => { delete window.horizonAPI; });
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Generate' })); };
describe('Floating answers and follow-up conversation', () => {
  it('offers circle and full-screen context immediately while allowing a text-only question', async () => {
    window.horizonAPI = { triggerCapture: vi.fn().mockResolvedValue(true), captureDesktop: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,test', displayLabel: 'Desktop' }) } as any;
    mock.dispatch.mockResolvedValue(answer('Text answer'));
    render(<FloatingBarWindow isDarkMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Circle Area' }));
    await waitFor(() => expect(window.horizonAPI?.triggerCapture).toHaveBeenCalledOnce());
    await waitFor(() => expect((screen.getByRole('button', { name: 'Full Screen' }) as HTMLButtonElement).disabled).toBe(false));
    send('A question without context');
    await waitFor(() => expect(mock.dispatch).toHaveBeenCalledWith('A question without context', [], []));
  });
  it('opens a fresh workspace chat with the unsent draft and selected screen context', async () => {
    window.horizonAPI = { openMainWindow: vi.fn(), captureDesktop: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,test', displayLabel: 'Desktop' }) } as any;
    render(<FloatingBarWindow isDarkMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Screen' }));
    await waitFor(() => expect(screen.getByAltText('Crop preview')).toBeDefined());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain this page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
    expect(window.horizonAPI?.openMainWindow).toHaveBeenCalledWith({ newChat: true, draft: 'Explain this page', attachments: [expect.objectContaining({ type: 'fullscreen', croppedDataUrl: 'data:image/png;base64,test' })] });
    expect(mock.dispatch).not.toHaveBeenCalled();
  });
  it('shows the actual answer in the bar and reuses history for a follow-up', async () => {
    mock.dispatch.mockResolvedValueOnce(answer('The answer is 42.')).mockResolvedValueOnce(answer('Because of the calculation.'));
    render(<FloatingBarWindow isDarkMode />); send('What is the answer?');
    await waitFor(() => expect(screen.getByText('The answer is 42.')).toBeDefined());
    expect(window.horizonAPI?.openMainWindow).not.toHaveBeenCalled();
    const id = localStorage.getItem('horizon_active_session_id'); send('Why?');
    await waitFor(() => expect(screen.getByText('Because of the calculation.')).toBeDefined());
    expect(mock.dispatch).toHaveBeenLastCalledWith('Why?', [], [{ role: 'user', text: 'What is the answer?' }, { role: 'assistant', text: 'The answer is 42.' }]);
    expect(localStorage.getItem('horizon_active_session_id')).toBe(id);
    const sessions = JSON.parse(localStorage.getItem('horizon_chat_sessions')!); expect(sessions).toHaveLength(1); expect(sessions[0].messages).toHaveLength(4);
  });
  it('shows a model or rate-limit failure in the bar without opening the workspace', async () => {
    mock.dispatch.mockResolvedValue(answer('AI request limit reached. Try again in 60 seconds.', 'error'));
    render(<FloatingBarWindow isDarkMode />); send('Explain');
    await waitFor(() => expect(screen.getByText(/AI request limit reached/)).toBeDefined());
    expect(window.horizonAPI?.openMainWindow).not.toHaveBeenCalled();
  });
  it('shows approval in the bar and lets the user deny there', async () => {
    mock.state = { ...answer('Approval needed', 'awaiting_tier2'), pendingTier2: { actionId: 'approval-1', description: 'Run a shell command', command: 'echo test' } };
    mock.dispatch.mockImplementation(async () => mock.state);
    // Seed a request first, then render the pending approval state.
    mock.state = null;
    mock.dispatch.mockImplementation(async () => { mock.state = { ...answer('Approval needed', 'awaiting_tier2'), pendingTier2: { actionId: 'approval-1', description: 'Run a shell command', command: 'echo test' } }; return mock.state; });
    mock.decide.mockImplementation(async () => { mock.state = answer('Action denied.'); return mock.state; });
    render(<FloatingBarWindow isDarkMode />); send('Run a command');
    await waitFor(() => expect(screen.getByText('Your approval is needed')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(screen.getByText('Action denied.')).toBeDefined());
    expect(mock.decide).toHaveBeenCalledWith('approval-1', false); expect(window.horizonAPI?.openMainWindow).not.toHaveBeenCalled();
  });
  it('clears the floating conversation only when the user starts a new one', async () => {
    mock.dispatch.mockResolvedValue(answer('First answer'));
    render(<FloatingBarWindow isDarkMode />); send('First question'); await waitFor(() => expect(screen.getByText('First answer')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New floating conversation' })); expect(screen.queryByText('First answer')).toBeNull();
    expect(JSON.parse(localStorage.getItem('horizon_chat_sessions')!)).toHaveLength(1);
  });
});
