import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Project Horizon Frontend E2E User Journey & Safety Gating Flows', () => {
  it('Flow 1: Interacts with the Contextual Prompt Bar and dispatches tasks', () => {
    render(<App />);

    const input = screen.getByPlaceholderText('Ask Gemini to inspect, refactor, or automate...');
    fireEvent.change(input, { target: { value: 'Open my code scanner project in VS Code' } });
    expect((input as HTMLInputElement).value).toBe('Open my code scanner project in VS Code');

    // Submit task via the Generate button
    const generateBtn = screen.getByText('Generate');
    fireEvent.click(generateBtn);

    // Verify confirmation feedback
    expect(screen.getByText(/Dispatched task to Gemini 2.5/i)).toBeDefined();
  });

  it('Flow 2: Interacts with the State Machine Controller tokens and state transitions', () => {
    render(<App />);

    // Click "Risk (Ivory)" state token
    const riskBtn = screen.getByText('Risk (Ivory)');
    fireEvent.click(riskBtn);

    expect(screen.getByText('INTERACTIVE_TEST')).toBeDefined();

    // Switch back to "Idle Standby"
    const idleBtn = screen.getByText('Idle Standby');
    fireEvent.click(idleBtn);
    expect(idleBtn).toBeDefined();
  });

  it('Flow 3: E2E Tier 2 HITL Security Modal trigger and dismissal flows', () => {
    render(<App />);

    // Trigger Tier 2 modal
    const simulateBtn = screen.getByText('Simulate Tier 2 Interrupter');
    fireEvent.click(simulateBtn);

    // Verify modal elements are visible
    const modalHeaders = screen.getAllByText('Review Destructive File Modification');
    expect(modalHeaders.length).toBeGreaterThanOrEqual(2); // One in component showcase, one in floating overlay

    // Click Deny Execution to dismiss floating modal
    const denyBtns = screen.getAllByText('Deny Execution');
    fireEvent.click(denyBtns[denyBtns.length - 1]);

    // Verify floating modal closed (back to 1 in showcase)
    expect(screen.getAllByText('Review Destructive File Modification').length).toBe(1);
  });

  it('Flow 4: First-Run Consent Modal acceptance lifecycle', () => {
    render(<App />);

    // Check for First-Run Consent Modal
    expect(screen.getByText('Google Gemini Multimodal Authorization')).toBeDefined();

    // Check the mandatory authorization checkbox
    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    // Find and click Enable Agent button
    const enableBtn = screen.getByText('Enable Agent');
    fireEvent.click(enableBtn);

    // Status updates to enabled
    expect(screen.getByText('Gemini Enabled ✓')).toBeDefined();
  });

  it('Flow 5: Settings and preferences suite tab switching and hotkey cycling', () => {
    render(<App />);

    // Hotkey default check
    expect(screen.getByText('Win + Shift + C')).toBeDefined();

    // Cycle Hotkey
    const cycleBtn = screen.getByText('Cycle Hotkey');
    fireEvent.click(cycleBtn);
    expect(screen.getByText('Ctrl + Space')).toBeDefined();

    // Switch to Project Roots tab
    const rootsTab = screen.getByText('Project Roots');
    fireEvent.click(rootsTab);
    expect(screen.getByText('Indexed Project Roots')).toBeDefined();

    // Switch to Inference Engine tab
    const backendTab = screen.getByText('Inference Engine');
    fireEvent.click(backendTab);
    expect(screen.getByText('Inference Engine Hardware')).toBeDefined();
  });
});
