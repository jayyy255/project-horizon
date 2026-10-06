import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App';
import { seedConversations } from './fixtures';
import { agentClient } from '../services/agentClient';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(agentClient, 'executeTask').mockResolvedValue({ sessionId: 'test', taskPrompt: 'test', status: 'done', currentNarration: 'Task completed', steps: [] });
});

describe('Project Horizon Frontend E2E User Journey & Safety Gating Flows', () => {
  it('Flow 1: Interacts with the Contextual Prompt Bar in production workspace and dispatches tasks', () => {
    render(<App />);

    const input = screen.getByPlaceholderText('Ask Gemini to inspect, refactor, or automate...');
    fireEvent.change(input, { target: { value: 'Open my code scanner project in VS Code' } });
    expect((input as HTMLInputElement).value).toBe('Open my code scanner project in VS Code');

    // Submit task via the Generate button
    const generateBtn = screen.getByText('Generate');
    fireEvent.click(generateBtn);

    // Verify confirmation feedback
    expect(screen.getByText(/Task submitted to Horizon/i)).toBeDefined();
  });

  it('Flow 2: Interacts with the Chat History Sidebar and session switching in production workspace', () => {
    seedConversations();
    render(<App />);

    // Verify past chat sessions are listed in the sidebar
    expect(screen.getAllByText('Explain compile error in WebGL vertex shader').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open target repo in VS Code and branch to feature/liquid')).toBeDefined();

    // Click "New Chat" button
    const newChatBtn = screen.getByText('New Chat');
    fireEvent.click(newChatBtn);

    // Switch to another past conversation by clicking on it
    const pastChat = screen.getByText('Open target repo in VS Code and branch to feature/liquid');
    fireEvent.click(pastChat);

    // Verify conversation transcript loads
    expect(screen.getByText(/Visual Studio Code/i)).toBeDefined();
  });

  it('Flow 3: E2E Tier 2 HITL Security Modal trigger and dismissal flows via programmatic event (no dev button)', () => {
    render(<App />);

    // Pre-condition: modal is not open, and no dev button exists
    expect(screen.queryByText(/Simulate Tier 2 Interrupter/i)).toBeNull();
    expect(screen.queryByText('Review Destructive File Modification')).toBeNull();

    // Trigger Tier 2 modal programmatically via test/IPC event
    act(() => {
      window.dispatchEvent(new CustomEvent('horizon:test-trigger-tier2'));
    });

    // Verify modal elements are visible
    const modalHeaders = screen.getAllByText('Review Destructive File Modification');
    expect(modalHeaders.length).toBeGreaterThanOrEqual(1);

    // Click Deny Execution to dismiss floating modal
    const denyBtn = screen.getByText('Deny Execution');
    fireEvent.click(denyBtn);

    // Verify modal closed
    expect(screen.queryByText('Review Destructive File Modification')).toBeNull();
  });

  it('Flow 4: First-Run Consent Modal acceptance lifecycle from production sidebar', () => {
    render(<App />);

    // Open Privacy Agreement / Consent Modal from production sidebar link
    const consentLink = screen.getByText('Privacy Agreement');
    fireEvent.click(consentLink);

    // Check for First-Run Consent Modal
    expect(screen.getByRole('dialog')).toBeDefined();

    // Check the mandatory authorization checkbox
    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    // Continue requires explicit consent.
    const enableBtn = screen.getByText('Continue');
    fireEvent.click(enableBtn);

    // Consent modal completes and dismisses
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Flow 5: Settings and preferences suite tab switching and hotkey cycling from production sidebar', async () => {
    render(<App />);

    // Open Settings Suite from sidebar preferences button
    const settingsBtn = screen.getByTitle('Open Preferences & Controls');
    fireEvent.click(settingsBtn);

    // Hotkey default check
    expect(screen.getByText('Win + Shift + C')).toBeDefined();

    // Cycle Hotkey
    const cycleBtn = screen.getByText('Cycle Hotkey');
    fireEvent.click(cycleBtn);
    await waitFor(() => expect(screen.getByText('Ctrl + Space')).toBeDefined());

    // Switch to Project Roots tab
    const rootsTab = screen.getByText('Project Roots');
    fireEvent.click(rootsTab);
    expect(screen.getByText('Indexed Project Roots')).toBeDefined();

    // Switch to Inference Engine tab
    const backendTab = screen.getByText('Inference Engine');
    fireEvent.click(backendTab);
    expect(screen.getByRole('heading', { name: 'Inference Engine' })).toBeDefined();
  });
});
