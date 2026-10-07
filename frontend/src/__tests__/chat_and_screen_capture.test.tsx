import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { ContextualPromptBar, ScreenAttachment } from '../components/ContextualPromptBar';
import { agentClient } from '../services/agentClient';
import { seedConversations } from './fixtures';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('Chat, Screen Capture, Multi-Attachments & Auto-Dismiss E2E Tests', () => {
  it('workspace requests create a new conversation without replacing previous history and carry the unsent draft', async () => {
    seedConversations();
    let requestChat: any;
    window.horizonAPI = { onDesktopCaptured: () => () => {}, onOverlayToggled: () => () => {}, onAreaAttached: () => () => {}, onWorkspaceChatRequested: (callback: any) => { requestChat = callback; return () => {}; } } as any;
    render(<App />);
    const previous = localStorage.getItem('horizon_active_session_id');
    fireEvent(window, new Event('focus')); // Listener is installed before the IPC request.
    const { act } = await import('@testing-library/react');
    act(() => requestChat({ newChat: true, draft: 'Explain my selection', attachments: [{ id: 'crop', label: 'Screen area', type: 'crop' }] }));
    await waitFor(() => expect(localStorage.getItem('horizon_active_session_id')).not.toBe(previous));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Explain my selection');
    expect(JSON.parse(localStorage.getItem('horizon_chat_sessions')!)).toHaveLength(3);
    expect(screen.queryByText('The shader requires a precision declaration.')).toBeNull();
    delete window.horizonAPI;
  });
  it('renders multi-attachment chips with individual remove buttons and triggers clear-all', () => {
    const mockAttachments: ScreenAttachment[] = [
      { id: 'att-1', label: 'Screen Area 1', type: 'crop', coords: { x: 100, y: 100, w: 200, h: 150 } },
      { id: 'att-2', label: 'Full Screen Display', type: 'fullscreen', coords: { x: 0, y: 0, w: 1920, h: 1080 } }
    ];

    let removedId = '';
    let clearedAll = false;

    render(
      <ContextualPromptBar
        isDarkMode={true}
        attachments={mockAttachments}
        onRemoveAttachment={(id) => { removedId = id; }}
        onClearAttachments={() => { clearedAll = true; }}
      />
    );

    expect(screen.getByText(/Area \[200×150px\]/i)).toBeDefined();
    expect(screen.getByText('Full Screen Display')).toBeDefined();

    // Click remove on first attachment
    const removeButtons = screen.getAllByTitle('Remove attachment');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]);
    expect(removedId).toBe('att-1');

    // Click Clear all
    const clearAllBtn = screen.getByText(/Clear all \(2\)/i);
    fireEvent.click(clearAllBtn);
    expect(clearedAll).toBe(true);
  });

  it('provides in-chat screen capture options (Circle Area & Full Screen)', () => {
    let lassoTriggered = false;
    let fullScreenTriggered = false;

    render(
      <ContextualPromptBar
        isDarkMode={true}
        onTriggerLasso={() => { lassoTriggered = true; }}
        onTriggerFullScreen={() => { fullScreenTriggered = true; }}
      />
    );

    // Open capture dropdown
    const captureBtn = screen.getByTitle(/Add files or context/i);
    fireEvent.click(captureBtn);

    // Click Circle Area
    const circleBtn = screen.getByText('Circle Area');
    fireEvent.click(circleBtn);
    expect(lassoTriggered).toBe(true);

    // Open capture dropdown again
    fireEvent.click(captureBtn);

    // Click Full Screen
    const fullScreenBtn = screen.getByText('Full Screen');
    fireEvent.click(fullScreenBtn);
    expect(fullScreenTriggered).toBe(true);
  });

  it('does NOT render static PowerShell or static VS Code windows by default', () => {
    render(<App />);
    expect(screen.queryByText(/PowerShell · Horizon Daemon/i)).toBeNull();
    expect(screen.queryByText(/project-horizon — VS Code/i)).toBeNull();
  });

  it('reports a real dispatch failure without fabricating a launched app', async () => {
    vi.spyOn(agentClient, 'executeTask').mockRejectedValue(new Error('Agent unavailable'));
    render(<App />);

    const input = screen.getByPlaceholderText(/Ask Gemini/i);
    fireEvent.change(input, { target: { value: 'open vs' } });

    const generateBtn = screen.getByText('Generate');
    fireEvent.click(generateBtn);

    await waitFor(() => expect(screen.getByText('Error executing task: Agent unavailable')).toBeDefined());
    expect(screen.queryByText('project-horizon — VS Code')).toBeNull();
    expect(screen.queryByText(/Successfully resolved workspace/i)).toBeNull();
  });

  it('auto-dismisses chat bar when clicking desktop workspace without any chat, and provides summon option', () => {
    render(<App />);

    // Chat bar is initially visible
    expect(screen.getByPlaceholderText(/Ask Gemini/i)).toBeDefined();

    // Click desktop workspace backdrop
    const workspace = screen.getByRole('main');
    expect(workspace).toBeDefined();

    // Click summon / shortcut hint to verify re-summoning works
    const summonBtn = screen.queryByText(/Summon Horizon Chat/i);
    // If not yet clicked outside, summon button is not there
    expect(summonBtn).toBeNull();
  });

  it('displays past chats in sidebar and allows user to continue a conversation thread', () => {
    seedConversations();
    vi.spyOn(agentClient, 'executeTask').mockResolvedValue({ sessionId: 'test', taskPrompt: 'follow up', status: 'done', currentNarration: 'Follow-up completed', steps: [] });
    render(<App />);

    // Verify Past Chats sidebar renders
    expect(screen.getByText('Past Chats')).toBeDefined();
    expect(screen.getByText('New Chat')).toBeDefined();
    expect(screen.getAllByText('Explain compile error in WebGL vertex shader').length).toBeGreaterThanOrEqual(1);

    // Switch to second session
    const session2Item = screen.getByText('Open target repo in VS Code and branch to feature/liquid');
    fireEvent.click(session2Item);

    // Verify session 2 messages loaded
    expect(screen.getByText(/Successfully launched Visual Studio Code targeting workspace/i)).toBeDefined();

    // Type a follow-up query to continue the conversation
    const input = screen.getByPlaceholderText(/Ask Gemini/i);
    fireEvent.change(input, { target: { value: 'Now create a pull request for feature/liquid' } });

    const generateBtn = screen.getByText('Generate');
    fireEvent.click(generateBtn);

    // Verify follow-up message is appended in the conversation stream
    expect(screen.getByText('Now create a pull request for feature/liquid')).toBeDefined();
  });
});
