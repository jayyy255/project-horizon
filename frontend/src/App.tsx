import { useState, useEffect } from 'react';
import { GeminiSparkle } from './components/GeminiSparkle';
import { ComponentCard } from './components/ComponentCard';
import { CaptureOverlayCanvas } from './components/CaptureOverlayCanvas';
import { ContextualPromptBar, ScreenAttachment } from './components/ContextualPromptBar';
import { HUDCollapsedChip } from './components/HUDCollapsedChip';
import { ReActTracePanel, TraceStep } from './components/ReActTracePanel';
import { Tier2Modal } from './components/Tier2Modal';
import { SystemTrayPopover } from './components/SystemTrayPopover';
import { FirstRunConsentModal } from './components/FirstRunConsentModal';
import { SettingsPreferencesSuite } from './components/SettingsPreferencesSuite';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { StateMachineTokenKit } from './components/StateMachineTokenKit';
import { 
  Sun, 
  Moon, 
  Layers, 
  Shield, 
  Wifi, 
  WifiOff, 
  Monitor, 
  Camera, 
  History, 
  Sliders, 
  X,
  Maximize2,
  Terminal,
  Code2
} from 'lucide-react';
import { useHorizonAgent } from './hooks/useHorizonAgent';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<'cockpit' | 'studio'>('cockpit');
  const [activeTabFilter, setActiveTabFilter] = useState("all");
  
  // Desktop Cockpit UI States
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [showTrayPopover, setShowTrayPopover] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // Screen attachments & chat visibility
  const [attachments, setAttachments] = useState<ScreenAttachment[]>([]);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; prompt: string; timestamp: string; attachmentsCount: number }>>([]);
  const [, setPastSessions] = useState<Array<{ id: number; title: string; time: string; messagesCount: number; status: string }>>([
    { id: 1, title: "Explain compile error in WebGL vertex shader", time: "12m ago", messagesCount: 2, status: "succeeded" },
    { id: 2, title: "Open target repo in VS Code and branch to feature/liquid", time: "48m ago", messagesCount: 1, status: "succeeded" }
  ]);

  // Dynamically opened applications by the AI agent
  interface ActiveAppWindow {
    id: string;
    title: string;
    type: 'vscode' | 'chrome' | 'graph';
    pid: number;
    activeFile?: string;
    codeSnippet?: string;
    graphData?: { nodes: number; edges: number; label: string };
  }
  const [activeApps, setActiveApps] = useState<ActiveAppWindow[]>([]);

  // Live Agent WebSocket & REST Service Connection
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

  // Global Hotkey Listener: Win/Ctrl + Shift + C for Shortcut Summon & Screen Select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setIsChatVisible(true);
        setIsCaptureActive(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCaptureActive(false);
        setIsTraceExpanded(false);
        setShowTier2Modal(false);
        setShowTrayPopover(false);
        setShowSettingsModal(false);
        setShowConsentModal(false);
        setShowHistoryDrawer(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const handleAddAttachment = (data: { type: 'crop' | 'fullscreen'; label: string; coords?: { x: number; y: number; w: number; h: number } }) => {
    const newAtt: ScreenAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: data.label,
      type: data.type,
      coords: data.coords,
      timestamp: Date.now()
    };
    setAttachments(prev => [...prev, newAtt]);
    setIsCaptureActive(false);
    setIsChatVisible(true);
  };

  const handleQuickFullScreenCapture = () => {
    handleAddAttachment({
      type: 'fullscreen',
      label: 'Full Screen',
      coords: { x: 0, y: 0, w: 1920, h: 1080 }
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleClearAttachments = () => {
    setAttachments([]);
  };

  const handleWorkspaceClick = () => {
    if (isCaptureActive) return;
    if (!isChatVisible) return;

    if (chatMessages.length === 0 && attachments.length === 0) {
      // No chat made: exit application spotlight
      setIsChatVisible(false);
    } else {
      // Chat made: preserve and add to previous chat history
      if (chatMessages.length > 0) {
        setPastSessions(prev => [
          {
            id: Date.now(),
            title: chatMessages[chatMessages.length - 1].prompt,
            time: 'Just now',
            messagesCount: chatMessages.length,
            status: 'succeeded'
          },
          ...prev
        ]);
      }
      setChatMessages([]);
      setAttachments([]);
      setIsChatVisible(false);
    }
  };

  const handleTaskSubmit = async (prompt: string, atts: ScreenAttachment[]) => {
    setChatMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachmentsCount: atts.length
      }
    ]);

    const lower = prompt.toLowerCase();
    if (lower.includes("open vs") || lower.includes("open code") || lower.includes("open vscode") || lower.includes("launch vs")) {
      if (!activeApps.some(app => app.type === 'vscode')) {
        setActiveApps(prev => [
          ...prev,
          {
            id: `vscode-${Date.now()}`,
            title: 'project-horizon — VS Code',
            type: 'vscode',
            pid: 4920,
            activeFile: 'src/shaders/liquid.frag',
            codeSnippet: 'void main() { gl_FragColor = vec4(0.55, 0.76, 0.91, 1.0); }'
          }
        ]);
      }
    } else if (lower.includes("graph") || lower.includes("prepare graph") || lower.includes("query graph")) {
      if (!activeApps.some(app => app.type === 'graph')) {
        setActiveApps(prev => [
          ...prev,
          {
            id: `graph-${Date.now()}`,
            title: 'Project Horizon — Knowledge Graph',
            type: 'graph',
            pid: 5180,
            graphData: { nodes: 142, edges: 320, label: 'Codebase Dependency & Security Graph' }
          }
        ]);
      }
    }

    const fullPrompt = atts.length > 0
      ? `[${atts.map(a => a.type === 'crop' && a.coords ? `Crop (${a.coords.x},${a.coords.y},${a.coords.w}×${a.coords.h})` : a.label).join(', ')}]: ${prompt}`
      : prompt;

    setAttachments([]);
    if (isConnected) {
      try {
        await dispatchTask(fullPrompt);
      } catch (e) {
        console.error('Task execution error:', e);
      }
    }
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
      {/* Ambient Celestial Backdrop Gradients */}
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
      <header className={`sticky top-0 z-50 backdrop-blur-2xl border-b transition-colors duration-300 px-6 py-3 shadow-sm ${
        isDarkMode ? 'border-slate-800/80 bg-[#090a0d]/85' : 'border-slate-200/90 bg-white/90'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#12284B] via-[#0055A0] to-[#8CC1E9] flex items-center justify-center text-[#FFF8E7] font-bold shadow-lg shadow-[#0055A0]/30 border border-[#FFF8E7]/40">
              <GeminiSparkle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight horizon-gradient-text">Project Horizon</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/40">
                  Celestial &amp; Cosmic Suite
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Multimodal Windows Desktop Agent
              </div>
            </div>
          </div>

          {/* View Switcher: Desktop Cockpit vs Component Studio */}
          <div className="flex items-center p-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-carbon-900/80">
            <button
              onClick={() => setViewMode('cockpit')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'cockpit'
                  ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Monitor size={14} />
              <span>Desktop Agent Cockpit</span>
            </button>
            <button
              onClick={() => setViewMode('studio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'studio'
                  ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers size={14} />
              <span>Component Studio</span>
            </button>
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

            {/* Quick Capture Overlay Trigger */}
            <button
              onClick={() => setIsCaptureActive(prev => !prev)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                isCaptureActive 
                  ? 'bg-[#8CC1E9]/20 border-[#8CC1E9] text-[#0055A0] dark:text-[#8CC1E9]' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-[#8CC1E9] text-slate-700 dark:text-slate-300'
              }`}
              title="Screen Capture (Win+Shift+C)"
            >
              <Camera size={14} />
              <span>{isCaptureActive ? 'Exit Capture' : 'Screen Capture'}</span>
            </button>

            {/* Simulate Tier 2 Interrupter */}
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

        {/* Studio Component Sub-navigation */}
        {viewMode === 'studio' && (
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto pt-3 mt-1 pb-1 border-t border-slate-200/60 dark:border-slate-800/60">
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
        )}
      </header>

      {/* ========================================================================= */}
      {/* PRIMARY VIEW: HORIZON DESKTOP AGENT COCKPIT                               */}
      {/* ========================================================================= */}
      {viewMode === 'cockpit' && (
        <main className="relative z-10 flex-1 flex flex-col p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {/* Simulated Windows 11 Desktop Agent Viewport */}
          <div className={`relative flex-1 min-h-[680px] rounded-3xl border-2 overflow-hidden shadow-2xl flex flex-col transition-all ${
            isDarkMode ? 'border-slate-800 bg-[#07090d]' : 'border-slate-200 bg-[#f4f7fb]'
          }`}>
            {/* Desktop Wallpaper Art & Ambience */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-85 transition-opacity"
              style={{
                background: isDarkMode
                  ? 'radial-gradient(ellipse at 70% 30%, rgba(0, 85, 160, 0.35) 0%, rgba(18, 40, 75, 0.6) 40%, #07090d 100%)'
                  : 'radial-gradient(ellipse at 70% 30%, rgba(140, 193, 233, 0.45) 0%, rgba(240, 246, 252, 0.9) 60%, #ffffff 100%)'
              }}
            />

            {/* Desktop Workspace Content: Active Apps Workspace */}
            <div 
              onClick={handleWorkspaceClick}
              className="relative z-10 p-6 flex-1 flex flex-col justify-between overflow-hidden cursor-default"
            >
              {/* Dynamic Opened Windows Area (Only shown when opened by AI agent command) */}
              <div className="space-y-4 max-w-xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
                {activeApps.map((app) => (
                  <div 
                    key={app.id}
                    className={`p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all animate-slide-up ${
                      isDarkMode ? 'bg-[#0f141c]/90 border-slate-700/80 text-slate-200' : 'bg-white/95 border-slate-300 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/60 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => setActiveApps(prev => prev.filter(a => a.id !== app.id))}
                            className="w-2.5 h-2.5 rounded-full bg-rose-500/90 hover:opacity-100 transition-opacity" 
                            title="Close Window"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold pl-1">
                          {app.type === 'vscode' && <Code2 size={13} className="text-[#438BC4]" />}
                          {app.type === 'graph' && <Layers size={13} className="text-emerald-400" />}
                          <span>{app.title}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">PID: {app.pid}</span>
                        <button 
                          onClick={() => setActiveApps(prev => prev.filter(a => a.id !== app.id))}
                          className="text-slate-400 hover:text-rose-400 p-0.5"
                          title="Close"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    {app.type === 'vscode' && (
                      <div className="font-mono text-xs text-slate-400 space-y-1">
                        <div className="text-[#8CC1E9]">// {app.activeFile}</div>
                        <div className="text-slate-200 dark:text-slate-300">{app.codeSnippet}</div>
                      </div>
                    )}
                    {app.type === 'graph' && app.graphData && (
                      <div className="font-mono text-xs text-slate-400 space-y-1.5">
                        <div className="text-emerald-400 font-semibold">{app.graphData.label}</div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {app.graphData.nodes} Nodes
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#8CC1E9]/15 text-[#8CC1E9] border border-[#8CC1E9]/30">
                            {app.graphData.edges} Edges
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* When chat is dismissed: Prompt user to re-summon */}
              {!isChatVisible && (
                <div className="mx-auto my-auto flex flex-col items-center gap-3 text-center animate-fade-in p-6">
                  <div className="w-12 h-12 rounded-3xl bg-gradient-to-tr from-[#12284B] via-[#0055A0] to-[#8CC1E9] flex items-center justify-center text-[#FFF8E7] shadow-xl shadow-[#0055A0]/25 border border-[#FFF8E7]/40 mb-1">
                    <GeminiSparkle size={24} />
                  </div>
                  <div className="text-sm font-semibold horizon-gradient-text">
                    Project Horizon Desktop Agent
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>Press</span>
                    <kbd className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-carbon-800 font-mono font-bold text-[#0055A0] dark:text-[#8CC1E9]">
                      Ctrl + Shift + C
                    </kbd>
                    <span>or click below to summon chat</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsChatVisible(true);
                    }}
                    className="mt-2 px-4 py-2 rounded-2xl text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-lg shadow-[#438BC4]/30 hover:brightness-110 transition-all border border-[#FFF8E7]/30 flex items-center gap-2"
                  >
                    <GeminiSparkle size={14} />
                    <span>Summon Horizon Chat</span>
                  </button>
                </div>
              )}

              {/* DOCKED AT THE BOTTOM: Agent Thinking HUD (Logs) & Chat Component directly above Taskbar */}
              <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-3 pt-6 pb-2 z-30">
                {/* Agent Thinking & Logs: Collapsed by Default with "View Logs" / "Collapse Logs" Toggle */}
                {(sessionState?.status === 'working' || sessionState?.status === 'done' || sessionState?.status === 'error' || isExecuting || (liveTraceSteps && liveTraceSteps.length > 0)) && (
                  <div className="w-full flex flex-col items-center gap-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    {/* Expanded ReAct Trace Panel (Only when user expands logs) */}
                    {isTraceExpanded && (
                      <div className="w-full max-h-72 overflow-y-auto mb-1 animate-slide-up shadow-2xl">
                        <ReActTracePanel
                          isDarkMode={isDarkMode}
                          steps={liveTraceSteps}
                          onClose={() => setIsTraceExpanded(false)}
                        />
                      </div>
                    )}

                    {/* HUD Collapsed State Chip (Default) */}
                    <HUDCollapsedChip
                      isDarkMode={isDarkMode}
                      isExpanded={isTraceExpanded}
                      onToggleLogs={() => setIsTraceExpanded(prev => !prev)}
                      currentNarration={sessionState?.currentNarration}
                    />
                  </div>
                )}

                {/* The Chat Component (Docked just above the taskbar) */}
                {isChatVisible && (
                  <div className="w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <ContextualPromptBar
                      isDarkMode={isDarkMode}
                      attachments={attachments}
                      onRemoveAttachment={handleRemoveAttachment}
                      onClearAttachments={handleClearAttachments}
                      onTriggerLasso={() => setIsCaptureActive(true)}
                      onTriggerFullScreen={handleQuickFullScreenCapture}
                      onSubmitPrompt={handleTaskSubmit}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* FULL-SCREEN SCREEN CAPTURE OVERLAY (When user triggers lasso or capture) */}
            {isCaptureActive && (
              <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-fade-in">
                <div className="w-full max-w-4xl relative">
                  <CaptureOverlayCanvas
                    isDarkMode={isDarkMode}
                    onExit={() => setIsCaptureActive(false)}
                    onAttachArea={(data) => {
                      handleAddAttachment(data);
                    }}
                  />
                  <button
                    onClick={() => setIsCaptureActive(false)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 shadow-xl border border-slate-600"
                    title="Close Screen Capture (Esc)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* WINDOWS 11 TASKBAR & SYSTEM TRAY DOCK */}
            <div className={`relative z-20 h-14 border-t backdrop-blur-2xl px-4 flex items-center justify-between transition-colors ${
              isDarkMode ? 'border-slate-800 bg-[#090a0d]/90' : 'border-slate-200 bg-white/90'
            }`}>
              {/* Taskbar Pinned Apps */}
              <div className="flex items-center gap-2">
                {/* Windows Start */}
                <button 
                  onClick={() => setIsCaptureActive(true)}
                  className="p-2 rounded-xl hover:bg-[#8CC1E9]/20 transition-all text-[#0055A0] dark:text-[#8CC1E9]"
                  title="Screen Capture (Win+Shift+C)"
                >
                  <GeminiSparkle size={18} />
                </button>
                {/* App icons */}
                <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-1" />
                <button 
                  onClick={() => setIsCaptureActive(prev => !prev)}
                  className={`p-2 rounded-xl transition-all ${
                    isCaptureActive ? 'bg-[#8CC1E9]/30 text-[#0055A0] dark:text-[#8CC1E9]' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'
                  }`}
                  title="Screen Capture"
                >
                  <Camera size={16} />
                </button>
                <button 
                  onClick={() => setIsTraceExpanded(prev => !prev)}
                  className={`p-2 rounded-xl transition-all ${
                    isTraceExpanded ? 'bg-[#8CC1E9]/30 text-[#0055A0] dark:text-[#8CC1E9]' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'
                  }`}
                  title="ReAct Trace Panel"
                >
                  <Terminal size={16} />
                </button>
              </div>

              {/* Taskbar Center Label */}
              <div className="text-xs font-mono text-slate-400 hidden sm:flex items-center gap-2">
                <span>Press</span>
                <kbd className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200">
                  Ctrl + Shift + C
                </kbd>
                <span>to capture and ground</span>
              </div>

              {/* Right System Tray */}
              <div className="relative flex items-center gap-3">
                {/* System Tray Icon */}
                <button
                  onClick={() => setShowTrayPopover(prev => !prev)}
                  className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
                    showTrayPopover 
                      ? 'border-[#8CC1E9] bg-[#8CC1E9]/20' 
                      : 'border-slate-300 dark:border-slate-800 hover:border-[#8CC1E9]'
                  }`}
                  title="Project Horizon System Tray Menu"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#8CC1E9] via-[#438BC4] to-[#FFF8E7] animate-pulse" />
                  <GeminiSparkle size={14} />
                </button>

                {/* History Drawer Trigger */}
                <button
                  onClick={() => setShowHistoryDrawer(true)}
                  className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                  title="Open Session History"
                >
                  <History size={16} />
                </button>

                {/* Settings Suite Trigger */}
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                  title="Open Preferences & Controls"
                >
                  <Sliders size={16} />
                </button>

                {/* System Clock */}
                <div className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 pl-2">
                  18:44
                </div>

                {/* SYSTEM TRAY POPOVER (Anchored above tray) */}
                {showTrayPopover && (
                  <div className="absolute bottom-16 right-0 z-50 animate-fade-in shadow-2xl">
                    <SystemTrayPopover
                      isDarkMode={isDarkMode}
                      onOpenHUD={() => {
                        setIsTraceExpanded(true);
                        setShowTrayPopover(false);
                      }}
                      onOpenHistory={() => {
                        setShowHistoryDrawer(true);
                        setShowTrayPopover(false);
                      }}
                      onOpenPreferences={() => {
                        setShowSettingsModal(true);
                        setShowTrayPopover(false);
                      }}
                      onQuit={() => setShowTrayPopover(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SECONDARY VIEW: DESIGN SYSTEM & COMPONENT STUDIO                         */}
      {/* ========================================================================= */}
      {viewMode === 'studio' && (
        <main className="relative z-10 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-12 pb-24">
          {/* 1. §5.1 CAPTURE OVERLAY CANVAS */}
          <ComponentCard
            id="comp-capture"
            spec="§5.1"
            title="Capture Overlay Canvas"
            description="Screen capture buffer featuring smooth Catmull-Rom neon curve (#8CC1E9 -> #438BC4 -> #0055A0 -> #FFF8E7), dashed celestial cyan AABB with 12px padding, and coordinate overlay."
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
                    console.error('Task dispatch error:', e);
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
      )}

      {/* ========================================================================= */}
      {/* MODALS & DRAWERS (Accessible in Cockpit Mode)                             */}
      {/* ========================================================================= */}

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

      {/* Settings & Preferences Suite Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative">
            <SettingsPreferencesSuite isDarkMode={isDarkMode} />
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* First-Run Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative">
            <FirstRunConsentModal 
              isDarkMode={isDarkMode} 
              onConsentGiven={() => setShowConsentModal(false)}
              onConsentDeclined={() => setShowConsentModal(false)}
            />
          </div>
        </div>
      )}

      {/* Session History & Follow-Up Drawer (Slide in from right) */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md h-full shadow-2xl animate-slide-in">
            <SessionHistoryDrawer isDarkMode={isDarkMode} />
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className={`relative z-10 border-t py-4 px-6 text-center text-xs transition-colors duration-300 ${
        isDarkMode ? 'border-slate-800/80 bg-[#090a0d]/85 text-slate-500' : 'border-slate-200/90 bg-white/90 text-slate-600'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <GeminiSparkle size={16} />
            <span className="font-medium">Project Horizon OS Agent · Windows 10/11 Multimodal Architecture</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <button 
              onClick={() => setShowConsentModal(true)}
              className="hover:text-[#8CC1E9] underline cursor-pointer"
            >
              Privacy Agreement
            </button>
            <span>·</span>
            <span>Microservice UI · Port 5173</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
