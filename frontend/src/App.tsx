import { useState, useEffect } from 'react';
import { GeminiSparkle } from './components/GeminiSparkle';
import { ComponentCard } from './components/ComponentCard';
import { CaptureOverlayCanvas } from './components/CaptureOverlayCanvas';
import { ContextualPromptBar } from './components/ContextualPromptBar';
import { HUDCollapsedChip } from './components/HUDCollapsedChip';
import { ReActTracePanel, TraceStep } from './components/ReActTracePanel';
import { Tier2Modal } from './components/Tier2Modal';
import { SystemTrayPopover } from './components/SystemTrayPopover';
import { FirstRunConsentModal } from './components/FirstRunConsentModal';
import { SettingsPreferencesSuite } from './components/SettingsPreferencesSuite';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { StateMachineTokenKit } from './components/StateMachineTokenKit';
import { Sun, Moon, Layers, Shield, Wifi, WifiOff } from 'lucide-react';
import { useHorizonAgent } from './hooks/useHorizonAgent';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTabFilter, setActiveTabFilter] = useState("all");
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  
  const {
    isConnected,
    sessionState,
    isExecuting,
    dispatchTask,
    submitTier2Decision,
  } = useHorizonAgent();

  // Automatically trigger Tier 2 Modal when backend signals awaiting_tier2
  useEffect(() => {
    if (sessionState?.status === 'awaiting_tier2' && sessionState.pendingTier2) {
      setShowTier2Modal(true);
    }
  }, [sessionState?.status, sessionState?.pendingTier2]);

  const liveTraceSteps: TraceStep[] | undefined = sessionState?.steps?.length
    ? sessionState.steps.map((s) => ({
        id: s.stepIndex,
        toolName: s.toolName,
        duration: s.durationMs ? `${Math.round(s.durationMs)}ms` : 'active',
        status: s.status,
        params: Object.fromEntries(
          Object.entries(s.args || {}).map(([k, v]) => [
            k,
            typeof v === 'object' ? JSON.stringify(v) : String(v),
          ])
        ),
        reasoning: s.reasoning || s.narration,
      }))
    : undefined;

  const componentList = [
    { id: "comp-capture", spec: "§5.1", label: "Capture Overlay" },
    { id: "comp-prompt", spec: "§5.2", label: "Prompt Input Bar" },
    { id: "comp-chip", spec: "§5.3", label: "HUD Collapsed Chip" },
    { id: "comp-trace", spec: "§5.4", label: "ReAct Trace Panel" },
    { id: "comp-tier2", spec: "§5.5", label: "Tier 2 Modal" },
    { id: "comp-tray", spec: "§5.6", label: "System Tray Popover" },
    { id: "comp-consent", spec: "§5.7", label: "First-Run Consent" },
    { id: "comp-settings", spec: "§5.8", label: "Settings Suite" },
    { id: "comp-history", spec: "§5.9", label: "Session History" },
    { id: "comp-tokens", spec: "§5.10", label: "State Machine & Tokens" },
  ];

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.remove('bg-[#ffffff]', 'text-slate-900');
      document.body.classList.add('bg-[#090a0d]', 'text-slate-100');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('bg-[#090a0d]', 'text-slate-100');
      document.body.classList.add('bg-[#ffffff]', 'text-slate-900');
    }
  }, [isDarkMode]);

  const scrollToComponent = (id: string) => {
    setActiveTabFilter(id);
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`min-h-screen relative flex flex-col transition-colors duration-500 ${
      isDarkMode ? 'bg-[#090a0d] text-slate-100 dark-satin-sheen' : 'bg-[#ffffff] text-slate-900'
    }`}>
      {/* Ambient Refraction Backdrops with Navy, Cobalt, Cerulean, Celestial and Cosmic Ivory Highlights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background: isDarkMode
              ? `radial-gradient(circle at 50% -10%, rgba(67, 139, 196, 0.18), transparent 45%),
                 radial-gradient(circle at 88% 25%, rgba(255, 248, 231, 0.08), transparent 40%),
                 radial-gradient(circle at 12% 65%, rgba(18, 40, 75, 0.5), transparent 45%),
                 radial-gradient(circle at 75% 75%, rgba(0, 85, 160, 0.15), transparent 40%)`
              : `radial-gradient(circle at 50% -10%, rgba(140, 193, 233, 0.2), transparent 50%),
                 radial-gradient(circle at 88% 25%, rgba(255, 248, 231, 0.35), transparent 45%),
                 radial-gradient(circle at 12% 65%, rgba(67, 139, 196, 0.12), transparent 40%),
                 radial-gradient(circle at 80% 80%, rgba(0, 85, 160, 0.08), transparent 45%)`
          }}
        />
      </div>

      {/* TOP MASTER HEADER & CONTROLS */}
      <header className={`sticky top-0 z-50 backdrop-blur-2xl border-b transition-colors duration-300 px-6 py-4 shadow-sm ${
        isDarkMode ? 'border-slate-800/80 bg-[#090a0d]/85' : 'border-slate-200/90 bg-white/90'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Version */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#12284B] via-[#0055A0] to-[#8CC1E9] flex items-center justify-center text-[#FFF8E7] font-bold shadow-lg shadow-[#0055A0]/30 border border-[#FFF8E7]/40">
              <GeminiSparkle size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight horizon-gradient-text">Project Horizon</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/40">
                  Celestial &amp; Cosmic Suite
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">10 Component Multimodal Suite Library</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            {/* Live Backend Connection Status */}
            <div
              className={`px-3 py-1.5 rounded-2xl text-[11px] font-mono flex items-center gap-2 border transition-all ${
                isConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                  : 'border-slate-700 bg-carbon-800 text-slate-400'
              }`}
              title={isConnected ? 'Connected to Agent Service on port 4100' : 'Agent Service offline'}
            >
              {isConnected ? <Wifi size={13} className="text-emerald-400" /> : <WifiOff size={13} className="text-slate-500" />}
              <span>{isConnected ? 'Backend: Connected (4100)' : 'Backend: Standalone'}</span>
            </div>

            <button
              onClick={() => setShowTier2Modal(true)}
              className="px-3.5 py-2 rounded-2xl text-xs font-semibold border border-amber-400/40 text-amber-500 dark:text-amber-400 hover:bg-amber-400/10 flex items-center gap-1.5 transition-all"
            >
              <Shield size={14} />
              <span>Simulate Tier 2 Interrupter</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-2xl border transition-all flex items-center gap-2 text-xs font-semibold ${
                isDarkMode 
                  ? 'border-slate-700 bg-carbon-800 text-slate-200 hover:border-[#8CC1E9]' 
                  : 'border-slate-200 bg-slate-100 text-slate-800 hover:border-[#438BC4]'
              }`}
              title="Toggle Light / Dark Mode"
            >
              {isDarkMode ? <Sun size={15} className="text-[#FFF8E7]" /> : <Moon size={15} className="text-[#12284B]" />}
              <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>

        {/* Component Navigation Chips */}
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto pt-3 mt-1 pb-1">
          <button
            onClick={() => scrollToComponent('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTabFilter === 'all'
                ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-md shadow-[#438BC4]/30 border border-[#FFF8E7]/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers size={13} />
            <span>All Components</span>
          </button>
          {componentList.map((comp, idx) => (
            <button
              key={comp.id}
              onClick={() => scrollToComponent(comp.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTabFilter === comp.id
                  ? 'bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9] font-bold shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">[{idx + 1}]</span>
              <span>{comp.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* MAIN SHOWCASE CONTAINER */}
      <main className="relative z-10 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-12 pb-24">
        
        {/* 1. §5.1 CAPTURE OVERLAY CANVAS */}
        <ComponentCard
          id="comp-capture"
          spec="§5.1"
          title="Capture Overlay Canvas"
          description="DXGI frozen screen buffer featuring smooth Catmull-Rom neon curve (#8CC1E9 -> #438BC4 -> #0055A0 -> #FFF8E7), dashed celestial cyan AABB with 12px padding, and coordinate overlay."
          isDarkMode={isDarkMode}
        >
          <CaptureOverlayCanvas isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 2. §5.2 CONTEXTUAL PROMPT INPUT BAR */}
        <ComponentCard
          id="comp-prompt"
          spec="§5.2"
          title="Contextual Prompt Input Bar"
          description="Floating liquid glass pill with Cosmic Ivory 4-point sparkle (#FFF8E7), multi-stop cobalt & celestial gradient query dispatch button, and soft suggested follow-up chips."
          isDarkMode={isDarkMode}
        >
          <ContextualPromptBar 
            isDarkMode={isDarkMode} 
            onSubmitPrompt={async (prompt) => {
              if (isConnected) {
                try {
                  await dispatchTask(prompt);
                } catch (e) {
                  console.error('Error executing task:', e);
                }
              }
            }}
          />
        </ComponentCard>

        {/* 3. §5.3 HUD COLLAPSED STATE CHIP */}
        <ComponentCard
          id="comp-chip"
          spec="§5.3"
          title="HUD Collapsed State Chip"
          description="Google Gemini-inspired floating pill with celestial cyan, cerulean, cobalt & cosmic ivory traveling shimmer border, glowing spark indicator, and execution narration."
          isDarkMode={isDarkMode}
        >
          <HUDCollapsedChip 
            isDarkMode={isDarkMode} 
            currentNarration={sessionState?.currentNarration}
          />
        </ComponentCard>

        {/* 4. §5.4 HUD EXPANDED REACT TRACE PANEL */}
        <ComponentCard
          id="comp-trace"
          spec="§5.4"
          title="HUD Expanded ReAct Trace Panel"
          description="Multimodal agent execution tree featuring celestial cyan/cosmic ivory status nodes, timing telemetry, tool parameters, and Gemini reasoning disclosures."
          isDarkMode={isDarkMode}
        >
          <ReActTracePanel 
            isDarkMode={isDarkMode} 
            steps={liveTraceSteps}
          />
        </ComponentCard>

        {/* 5. §5.5 TIER 2 CONFIRMATION MODAL */}
        <ComponentCard
          id="comp-tier2"
          spec="§5.5"
          title="Tier 2 Confirmation Modal (Safety Interrupter)"
          description="High-contrast cosmic ivory & cobalt blue refractive safety interrupter with raw shell payload inspect, SQLite audit notice, and multi-stop authorization action."
          isDarkMode={isDarkMode}
        >
          <Tier2Modal isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 6. §5.6 SYSTEM TRAY PRESENCE POPOVER */}
        <ComponentCard
          id="comp-tray"
          spec="§5.6"
          title="System Tray Presence Popover"
          description="Compact desktop taskbar tray popover with Gemini 4-state orb indicator (#8CC1E9 & #FFF8E7 active), Quick-Pause toggle, and rounded Lucide menu controls."
          isDarkMode={isDarkMode}
        >
          <SystemTrayPopover isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 7. §5.7 FIRST-RUN ONBOARDING & CONSENT MODAL */}
        <ComponentCard
          id="comp-consent"
          spec="§5.7"
          title="First-Run Onboarding & Consent Modal"
          description="Sandboxing boundary disclosure with Gemini multimodal authorization, celestial boundary cards, and cobalt to celestial cyan activation."
          isDarkMode={isDarkMode}
        >
          <FirstRunConsentModal isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 8. §5.8 SETTINGS & PREFERENCES SUITE */}
        <ComponentCard
          id="comp-settings"
          spec="§5.8"
          title="Settings & Preferences Suite"
          description="Multi-tab desktop preference manager with hotkey remapping, indexed filesystem roots, DirectML GPU switching, retention sliders, and HUD quadrant docking."
          isDarkMode={isDarkMode}
        >
          <SettingsPreferencesSuite isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 9. §5.9 SESSION HISTORY & FOLLOW-UP DRAWER */}
        <ComponentCard
          id="comp-history"
          spec="§5.9"
          title="Session History & Follow-Up Drawer"
          description="Historical session preview with screenshot crop thumbnails, status badges, and an integrated retrospective Q&A prompt with rich gradient chat pills."
          isDarkMode={isDarkMode}
        >
          <SessionHistoryDrawer isDarkMode={isDarkMode} />
        </ComponentCard>

        {/* 10. §5.10 HUD STATE MACHINE CONTROLLER & TOKEN KIT */}
        <ComponentCard
          id="comp-tokens"
          spec="§5.10"
          title="HUD State Machine Controller & Token Kit"
          description="Dynamic state machine tester for all 5 agent states paired with the official #FFF8E7, #8CC1E9, #12284B, #0055A0, and #438BC4 design tokens."
          isDarkMode={isDarkMode}
        >
          <StateMachineTokenKit isDarkMode={isDarkMode} />
        </ComponentCard>

      </main>

      {/* Floating Tier 2 Modal (when simulated or triggered by backend) */}
      {showTier2Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Tier2Modal 
            isDarkMode={isDarkMode} 
            payload={sessionState?.pendingTier2}
            onAuthorize={() => {
              if (sessionState?.pendingTier2) {
                submitTier2Decision(sessionState.pendingTier2.actionId, true);
              }
              setShowTier2Modal(false);
            }}
            onDeny={() => {
              if (sessionState?.pendingTier2) {
                submitTier2Decision(sessionState.pendingTier2.actionId, false);
              }
              setShowTier2Modal(false);
            }}
          />
        </div>
      )}

      {/* FOOTER */}
      <footer className={`relative z-10 border-t py-8 px-6 text-center text-xs transition-colors duration-300 ${
        isDarkMode ? 'border-slate-800/80 bg-[#090a0d]/85 text-slate-500' : 'border-slate-200/90 bg-white/90 text-slate-600'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <GeminiSparkle size={16} />
            <span className="font-medium">Project Horizon OS Agent · Celestial Cyan, Cobalt &amp; Cosmic Ivory Harmony</span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Microservice UI · Port 5173 · Windows 10/11 Target
          </div>
        </div>
      </footer>
    </div>
  );
}
