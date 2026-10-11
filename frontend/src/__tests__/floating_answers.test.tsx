import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    await waitFor(() => expect(mock.dispatch).toHaveBeenCalledWith('A question without context', [], [], []));
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
    expect(mock.dispatch).toHaveBeenLastCalledWith('Why?', [], [{ role: 'user', text: 'What is the answer?' }, { role: 'assistant', text: 'The answer is 42.' }], []);
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
  it('retains the original selected image for a different follow-up question', async () => {
    window.horizonAPI = { captureDesktop: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,original', displayLabel: 'Desktop' }) } as any;
    mock.dispatch.mockResolvedValue(answer('First answer'));
    render(<FloatingBarWindow isDarkMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Screen' }));
    await waitFor(() => expect(screen.getByAltText('Crop preview')).toBeDefined());
    send('Read the title'); await waitFor(() => expect(screen.getByText('First answer')).toBeDefined());
    send('What is in the bottom corner?');
    await waitFor(() => expect(mock.dispatch).toHaveBeenCalledTimes(2));
    expect(mock.dispatch.mock.calls[1][1]).toEqual(['data:image/png;base64,original']);
    expect(mock.dispatch.mock.calls[1][3][0].type).toBe('fullscreen');
  });
  it('hotkey starts a fresh chat after an answer while keeping the earlier chat in history', async () => {
    let summon = () => {};
    window.horizonAPI = { onFloatingNewChat: (callback: () => void) => { summon = callback; return () => {}; }, setFloatingState: vi.fn() } as any;
    mock.dispatch.mockResolvedValue(answer('Old answer'));
    render(<FloatingBarWindow isDarkMode />); send('Old question');
    await waitFor(() => expect(screen.getByText('Old answer')).toBeDefined());
    const oldId = localStorage.getItem('horizon_active_session_id');
    act(() => summon()); expect(screen.queryByText('Old answer')).toBeNull();
    send('New question'); await waitFor(() => expect(mock.dispatch).toHaveBeenCalledTimes(2));
    expect(mock.dispatch.mock.calls[1][2]).toEqual([]);
    expect(localStorage.getItem('horizon_active_session_id')).not.toBe(oldId);
    expect(JSON.parse(localStorage.getItem('horizon_chat_sessions')!)).toHaveLength(2);
  });
  it('does not discard an unfinished request when a summon event arrives', async () => {
    let summon = () => {}, resolve!: (value: any) => void;
    window.horizonAPI = { onFloatingNewChat: (callback: () => void) => { summon = callback; return () => {}; } } as any;
    mock.dispatch.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<FloatingBarWindow isDarkMode />); send('Pending question');
    act(() => summon()); expect(screen.getByText('Pending question')).toBeDefined();
    await act(async () => resolve(answer('Complete'))); expect(screen.getByText('Complete')).toBeDefined();
  });
  it('adds a scanned document through the picker and displays scan failures', async () => {
    window.horizonAPI = { chooseAttachments: vi.fn().mockResolvedValueOnce([{ id: 'doc', documentId: 'doc', label: 'notes.pdf', type: 'pdf', safety: 'Defender scan completed' }]).mockRejectedValueOnce(new Error('Attachment blocked: scanner unavailable')) } as any;
    mock.dispatch.mockResolvedValue(answer('Document answer'));
    render(<FloatingBarWindow isDarkMode />); fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    await waitFor(() => expect(screen.getByText('notes.pdf')).toBeDefined());
    send('Summarize'); await waitFor(() => expect(screen.getByText('Document answer')).toBeDefined());
    expect(mock.dispatch.mock.calls[0][3][0].documentId).toBe('doc');
    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('scanner unavailable'));
  });
});
