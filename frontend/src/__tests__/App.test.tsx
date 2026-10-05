import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import App from '../App';
import { useHorizonAgent } from '../hooks/useHorizonAgent';

describe('Project Horizon Production App Suite', () => {
  it('renders production header with Horizon title (no dev chrome)', () => {
    render(<App />);
    expect(screen.getAllByText('Project Horizon').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Multimodal Windows Desktop Agent')).toBeDefined();

    // Confirm dev buttons & badges are strictly NOT rendered
    expect(screen.queryByText(/Backend: Connected/i)).toBeNull();
    expect(screen.queryByText(/Simulate Tier 2 Interrupter/i)).toBeNull();
    expect(screen.queryByText('Desktop Agent Cockpit')).toBeNull();
    expect(screen.queryByText('Component Studio')).toBeNull();
  });

  it('renders conversational two-column workspace with past chats sidebar and prompt bar', () => {
    render(<App />);
    expect(screen.getByText('Past Chats')).toBeDefined();
    expect(screen.getByPlaceholderText('Ask Gemini to inspect, refactor, or automate...')).toBeDefined();
  });

  it('toggles between dark and light modes via icon click', () => {
    render(<App />);
    const themeButton = screen.getByTitle('Toggle Light / Dark Mode');
    fireEvent.click(themeButton);
  });

  it('triggers Tier 2 security modal programmatically without any visible UI button', () => {
    render(<App />);
    // Pre-condition: modal is not open
    expect(screen.queryByText('Review Destructive File Modification')).toBeNull();

    // Programmatic trigger via event/IPC channel
    act(() => {
      window.dispatchEvent(new CustomEvent('horizon:test-trigger-tier2'));
    });

    // Modal renders safely
    expect(screen.getAllByText('Review Destructive File Modification').length).toBeGreaterThanOrEqual(1);
  });

  it('verifies backend health and connection state via hook state without UI badge', () => {
    const { result } = renderHook(() => useHorizonAgent());
    expect(typeof result.current.isConnected).toBe('boolean');
    expect(typeof result.current.dispatchTask).toBe('function');
    expect(typeof result.current.submitTier2Decision).toBe('function');
  });
});
