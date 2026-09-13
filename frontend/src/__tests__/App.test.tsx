import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Project Horizon Frontend Suite', () => {
  it('renders master header with Horizon title and tag', () => {
    render(<App />);
    expect(screen.getAllByText('Project Horizon').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Celestial & Cosmic Suite')).toBeDefined();
  });

  it('renders all 10 component cards from specification', () => {
    render(<App />);
    expect(screen.getByText('Capture Overlay Canvas')).toBeDefined();
    expect(screen.getByText('Contextual Prompt Input Bar')).toBeDefined();
    expect(screen.getByText('HUD Collapsed State Chip')).toBeDefined();
    expect(screen.getByText('HUD Expanded ReAct Trace Panel')).toBeDefined();
    expect(screen.getByText('Tier 2 Confirmation Modal (Safety Interrupter)')).toBeDefined();
    expect(screen.getByText('System Tray Presence Popover')).toBeDefined();
    expect(screen.getByText('First-Run Onboarding & Consent Modal')).toBeDefined();
    expect(screen.getByText('Settings & Preferences Suite')).toBeDefined();
    expect(screen.getByText('Session History & Follow-Up Drawer')).toBeDefined();
    expect(screen.getByText('HUD State Machine Controller & Token Kit')).toBeDefined();
  });

  it('toggles between dark and light modes', () => {
    render(<App />);
    const themeButton = screen.getByTitle('Toggle Light / Dark Mode');
    expect(themeButton.textContent).toContain('Light Mode');
    fireEvent.click(themeButton);
    expect(themeButton.textContent).toContain('Dark Mode');
  });

  it('allows simulating the Tier 2 security modal interrupter', () => {
    render(<App />);
    const simulateButton = screen.getByText('Simulate Tier 2 Interrupter');
    fireEvent.click(simulateButton);
    expect(screen.getAllByText('Review Destructive File Modification').length).toBeGreaterThanOrEqual(1);
  });
});
