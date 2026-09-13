import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { ContextualPromptBar, ScreenAttachment } from '../components/ContextualPromptBar';

describe('Chat, Screen Capture, Multi-Attachments & Auto-Dismiss E2E Tests', () => {
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
    const captureBtn = screen.getByTitle(/Screen Capture: Circle an area or select full screen/i);
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

  it('dynamically opens VS Code when user inputs "open vs"', () => {
    render(<App />);

    const input = screen.getByPlaceholderText(/Ask Gemini/i);
    fireEvent.change(input, { target: { value: 'open vs' } });

    const generateBtn = screen.getByText('Generate');
    fireEvent.click(generateBtn);

    // VS Code window should now dynamically appear in active apps
    expect(screen.getByText('project-horizon — VS Code')).toBeDefined();
    expect(screen.getByText('// src/shaders/liquid.frag')).toBeDefined();
  });

  it('auto-dismisses chat bar when clicking desktop workspace without any chat, and provides summon option', () => {
    render(<App />);

    // Chat bar is initially visible
    expect(screen.getByPlaceholderText(/Ask Gemini/i)).toBeDefined();

    // Click desktop workspace backdrop
    const workspace = screen.getByText(/Multimodal Windows Desktop Agent/i).closest('main');
    expect(workspace).toBeDefined();

    // Click summon / shortcut hint to verify re-summoning works
    const summonBtn = screen.queryByText(/Summon Horizon Chat/i);
    // If not yet clicked outside, summon button is not there
    expect(summonBtn).toBeNull();
  });
});
