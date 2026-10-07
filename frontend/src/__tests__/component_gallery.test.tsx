import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaptureOverlayCanvas } from '../components/CaptureOverlayCanvas';
import { ContextualPromptBar } from '../components/ContextualPromptBar';
import { HUDCollapsedChip } from '../components/HUDCollapsedChip';
import { ReActTracePanel } from '../components/ReActTracePanel';
import { Tier2Modal } from '../components/Tier2Modal';
import { SystemTrayPopover } from '../components/SystemTrayPopover';
import { FirstRunConsentModal } from '../components/FirstRunConsentModal';
import { SettingsPreferencesSuite } from '../components/SettingsPreferencesSuite';
import { SessionHistoryDrawer } from '../components/SessionHistoryDrawer';
import { StateMachineTokenKit } from '../components/StateMachineTokenKit';

describe('Project Horizon Isolated Component Specifications (Dev Gallery Suite)', () => {
  it('renders CaptureOverlayCanvas with HUD and exit controls', () => {
    render(<CaptureOverlayCanvas isDarkMode={true} onExit={() => {}} onAttachArea={() => {}} />);
    expect(screen.getByText('Screen context')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeDefined();
  });

  it('renders ContextualPromptBar with search placeholder and controls', () => {
    render(<ContextualPromptBar isDarkMode={true} />);
    expect(screen.getByPlaceholderText(/Ask Gemini to inspect/i)).toBeDefined();
    expect(screen.getByText('Generate')).toBeDefined();
  });

  it('renders HUDCollapsedChip in standby state', () => {
    render(<HUDCollapsedChip isDarkMode={true} isExpanded={false} onToggleLogs={() => {}} />);
    expect(screen.getByText('Ready')).toBeDefined();
    expect(screen.getByText('No active task')).toBeDefined();
  });

  it('renders ReActTracePanel with thought and observation steps', () => {
    const mockSteps = [
      {
        id: 1,
        toolName: 'Inspect active VS Code buffer',
        duration: '120ms',
        status: 'succeeded' as const,
        params: { file: 'src/shaders/liquid.frag' },
        reasoning: 'Grounded target file in workspace'
      }
    ];
    render(<ReActTracePanel isDarkMode={true} steps={mockSteps} onClose={() => {}} />);
    expect(screen.getByText(/Inspect active VS Code buffer/i)).toBeDefined();
  });

  it('renders Tier2Modal safety interrupter with review details and action buttons', () => {
    render(<Tier2Modal isDarkMode={true} onDeny={() => {}} onAuthorize={() => {}} />);
    expect(screen.getByText('Review Destructive File Modification')).toBeDefined();
    expect(screen.getByText('Deny Execution')).toBeDefined();
    expect(screen.getByText('Allow Execution')).toBeDefined();
  });

  it('renders SystemTrayPopover menu options', () => {
    render(<SystemTrayPopover isDarkMode={true} />);
    expect(screen.getByText('Project Horizon')).toBeDefined();
    expect(screen.getByText(/Gemini Agent:/i)).toBeDefined();
  });

  it('renders FirstRunConsentModal with boundary disclosures and authorization checkbox', () => {
    render(<FirstRunConsentModal isDarkMode={true} onConsentGiven={() => {}} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('You choose what to share')).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeDefined();
  });

  it('renders SettingsPreferencesSuite with tab controls and hotkey manager', () => {
    render(<SettingsPreferencesSuite isDarkMode={true} />);
    expect(screen.getByText('Floating Assistant Hotkey')).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Floating assistant shortcut' })).toBeDefined();
    expect(screen.getByText('Project Roots')).toBeDefined();
  });

  it('renders SessionHistoryDrawer with query filter and export options', () => {
    render(<SessionHistoryDrawer isDarkMode={true} />);
    expect(screen.getByText('Session Memory & Follow-Up')).toBeDefined();
    expect(screen.getByText('Your conversations will appear here.')).toBeDefined();
  });

  it('renders StateMachineTokenKit with interactive token kit', () => {
    render(<StateMachineTokenKit isDarkMode={true} />);
    expect(screen.getByText('Gemini Dual-Mode Design Tokens')).toBeDefined();
    expect(screen.getByText('Idle Standby')).toBeDefined();
    expect(screen.getByText('Risk (Ivory)')).toBeDefined();
  });
});
