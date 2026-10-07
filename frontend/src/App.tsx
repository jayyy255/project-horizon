import { useState, useEffect, useRef } from 'react';
import { HorizonMark } from './components/HorizonMark';
import { CaptureOverlayCanvas } from './components/CaptureOverlayCanvas';
import { ContextualPromptBar, ScreenAttachment } from './components/ContextualPromptBar';
import { HUDCollapsedChip } from './components/HUDCollapsedChip';
import { ReActTracePanel, TraceStep } from './components/ReActTracePanel';
import { Tier2Modal } from './components/Tier2Modal';
import { FirstRunConsentModal } from './components/FirstRunConsentModal';
import { SettingsPreferencesSuite } from './components/SettingsPreferencesSuite';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { FloatingBarWindow } from './components/FloatingBarWindow';
import { 
  Sun, 
  Moon, 
  Camera, 
  History, 
  Sliders, 
  X,
  MessageSquare,
  Trash2,
  Plus,
  Sparkles,
  Code2,
  Layers,
  Menu,
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';
import { useHorizonAgent } from './hooks/useHorizonAgent';
import { useHotkeyStatus } from './hooks/useHotkeyStatus';
import { useHorizonTheme } from './hooks/useHorizonTheme';
import { HOTKEY_OPTIONS } from '@shared/hotkeys';

export default function App() {
  // A floating window owns its agent subscription and conversation state.
  if (window.location.hash.includes('bar')) return <FloatingAssistantRoute />;
  return <DesktopWorkspace />;
}

function FloatingAssistantRoute() {
  const { isDarkMode } = useHorizonTheme();
  return <FloatingBarWindow isDarkMode={isDarkMode} />;
}

function DesktopWorkspace() {
  const { isDarkMode, setIsDarkMode } = useHorizonTheme();
  const feedRef = useRef<HTMLDivElement>(null);
  const executionSessionRef = useRef('');
  
  // Desktop Cockpit UI States
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState('');
  const { status: hotkeyStatus, loading: hotkeyLoading, error: hotkeyError, register: registerHotkey } = useHotkeyStatus();
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // Real Desktop Screenshot state from Electron desktopCapturer
  const [realScreenshotUrl, setRealScreenshotUrl] = useState<string | null>(null);
  const [captureDisplayInfo, setCaptureDisplayInfo] = useState<{ width: number; height: number; scaleFactor?: number; label?: string } | null>(null);
  const [captureSequence, setCaptureSequence] = useState(0);

  // Screen attachments & chat visibility
  const [attachments, setAttachments] = useState<ScreenAttachment[]>([]);
  const [workspaceDraft, setWorkspaceDraft] = useState('');
  const [composerVersion, setComposerVersion] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Full Conversational Chatbot Session Model (like Google Search AI mode)
  interface ChatMessageItem {
    id: string;
    sender: 'user' | 'assistant';
    text: string;
    timestamp: string;
    attachments?: ScreenAttachment[];
    steps?: TraceStep[];
    status?: 'done' | 'working' | 'error';
  }

  interface FullChatSession {
    id: string;
    title: string;
    createdAt: number;
    time: string;
    messages: ChatMessageItem[];
    thumbnail?: string;
  }

  const DEFAULT_CHAT_SESSIONS: FullChatSession[] = [];

  const [chatSessions, setChatSessions] = useState<FullChatSession[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem('horizon_chat_sessions');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_CHAT_SESSIONS;
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedActive = localStorage.getItem('horizon_active_session_id');
      if (savedActive) return savedActive;
    }
    return '';
  });

  // Sync chat sessions with local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('horizon_chat_sessions', JSON.stringify(chatSessions));
      } catch {}
    }
  }, [chatSessions]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('horizon_active_session_id', activeSessionId);
      } catch {}
    }
  }, [activeSessionId]);

  // Main-process settings restore the shortcut before the renderer loads.
  // Migrate existing 1.1.0 approvals once, retaining the user's chosen shortcut.
  useEffect(() => {
    if (!hotkeyLoading && !window.location.hash && !hotkeyStatus.approved) {
      const approved = localStorage.getItem('horizon_hotkey_approved');
      if (approved !== 'true' && import.meta.env.MODE !== 'test' && !window.location.hash) {
        setShowConsentModal(true);
      } else if (approved === 'true' && window.horizonAPI?.getHotkeyStatus) {
        const saved = HOTKEY_OPTIONS.find(option => option.label === localStorage.getItem('horizon_hotkey'));
        void registerHotkey(saved?.accelerator).catch(() => setConsentError('Could not restore your shortcut. Open Preferences to retry.'));
      }
    }
  }, [hotkeyLoading, hotkeyStatus.approved]);

  const handleConsentGiven = async () => {
    setSavingConsent(true); setConsentError('');
    try {
      if (window.horizonAPI?.approveHotkey) {
        const result = await registerHotkey();
        if (!result.approved) { setConsentError(result.error || 'Could not save setup. Please try again.'); return; }
      } else localStorage.setItem('horizon_hotkey_approved', 'true');
      setShowConsentModal(false);
    } catch (error) { setConsentError(error instanceof Error ? error.message : 'Could not finish setup.'); }
    finally { setSavingConsent(false); }
  };

  // Keep the main window and the floating bar on the same persisted conversation.
  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === 'horizon_chat_sessions' && event.newValue) {
        try { setChatSessions(JSON.parse(event.newValue)); } catch {}
      }
      if (event.key === 'horizon_active_session_id' && event.newValue) {
        setActiveSessionId(event.newValue);
        executionSessionRef.current = event.newValue;
      }
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, []);

  // Live Agent WebSocket & REST Service Connection
  const {
    sessionState,
    isExecuting,
    dispatchTask,
    submitTier2Decision,
    lastError,
  } = useHorizonAgent();

  useEffect(() => {
    if (!sessionState || !['done', 'error', 'idle'].includes(sessionState.status)) return;
    setChatSessions(prev => prev.map(s => s.id !== executionSessionRef.current ? s : {
      ...s,
      messages: s.messages.map(m => m.sender === 'assistant' && m.status === 'working' ? {
        ...m, text: sessionState.currentNarration, status: sessionState.status === 'error' ? 'error' : 'done',
      } : m),
    }));
  }, [sessionState]);

  // Automatically trigger Tier 2 Modal when backend signals awaiting_tier2
  useEffect(() => {
    if (sessionState?.status === 'awaiting_tier2' && sessionState.pendingTier2) {
      setShowTier2Modal(true);
    }
  }, [sessionState?.status, sessionState?.pendingTier2]);

  // Programmatic Tier 2 trigger listener for tests / IPC (no visible UI button needed)
  useEffect(() => {
    const handleTestTier2 = () => setShowTier2Modal(true);
    window.addEventListener('horizon:test-trigger-tier2', handleTestTier2);
    return () => window.removeEventListener('horizon:test-trigger-tier2', handleTestTier2);
  }, []);

  // Listen for real desktop capture broadcasts from Electron main process
  useEffect(() => {
    if (typeof window !== 'undefined' && window.horizonAPI) {
      const isCaptureHash = window.location.hash.includes('capture');

      const unsubCapture = window.horizonAPI.onDesktopCaptured((data) => {
        console.log('[App] Real desktop captured from Electron:', data.width, 'x', data.height);
        setRealScreenshotUrl(data.dataUrl);
        setCaptureSequence(sequence => sequence + 1);
        setCaptureDisplayInfo({
          width: data.width,
          height: data.height,
          scaleFactor: data.scaleFactor,
          label: data.displayLabel,
        });
        if (isCaptureHash) {
          setIsCaptureActive(true);
        }
      });

      const unsubOverlay = window.horizonAPI.onOverlayToggled((visible) => {
        if (isCaptureHash) {
          setIsCaptureActive(visible);
        }
        if (visible) {
        }
      });

      const unsubArea = window.horizonAPI.onAreaAttached((data) => {
        console.log('[App] Real region area attached from overlay:', data);
        handleAddAttachment(data);
        setIsCaptureActive(false);
      });

      return () => {
        unsubCapture();
        unsubOverlay();
        unsubArea();
      };
    }
  }, []);

  // Global summon shortcuts belong to the main process. Keep only local dismiss.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sessionState?.pendingTier2) submitTier2Decision(sessionState.pendingTier2.actionId, false).catch(() => {});
        setIsCaptureActive(false);
        setIsTraceExpanded(false);
        setShowTier2Modal(false);
        setShowSettingsModal(false);
        setShowConsentModal(false);
        setShowHistoryDrawer(false);
        if (typeof window !== 'undefined' && window.horizonAPI) {
          window.horizonAPI.closeOverlay();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionState?.pendingTier2, submitTier2Decision]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const handleAddAttachment = (data: { 
    type: 'crop' | 'fullscreen'; 
    label: string; 
    coords?: { x: number; y: number; w: number; h: number };
    croppedDataUrl?: string;
  }) => {
    const newAtt: ScreenAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: data.label,
      type: data.type,
      coords: data.coords,
      croppedDataUrl: data.croppedDataUrl,
      timestamp: Date.now()
    };
    setAttachments(prev => [...prev, newAtt]);
    setIsCaptureActive(false);
  };

  const handleQuickFullScreenCapture = async () => {
    if (typeof window !== 'undefined' && window.horizonAPI) {
      try {
        const data = await window.horizonAPI.captureDesktop();
        if (data && data.dataUrl) {
          handleAddAttachment({
            type: 'fullscreen',
            label: 'Full Screen',
            coords: { x: 0, y: 0, w: data.width, h: data.height },
            croppedDataUrl: data.dataUrl,
          });
          return;
        }
      } catch (err) {
        console.warn('captureDesktop failed in handleQuickFullScreenCapture:', err);
      }
    }
    handleAddAttachment({
      type: 'fullscreen',
      label: 'Full Screen',
      coords: { x: 0, y: 0, w: 1920, h: 1080 },
      croppedDataUrl: realScreenshotUrl || undefined,
    });
  };

  const handleTriggerLasso = () => {
    if (typeof window !== 'undefined' && window.horizonAPI) {
      window.horizonAPI.toggleOverlay();
    } else {
      setIsCaptureActive(true);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleClearAttachments = () => {
    setAttachments([]);
  };

  const handleNewChat = () => {
    const newId = `session-${crypto.randomUUID()}`;
    const newSession: FullChatSession = {
      id: newId,
      title: 'New Conversation',
      createdAt: Date.now(),
      time: 'Just now',
      messages: [],
    };
    setChatSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setAttachments([]);
    setWorkspaceDraft('');
    setComposerVersion(value => value + 1);
  };

  useEffect(() => window.horizonAPI?.onWorkspaceChatRequested?.(request => {
    handleNewChat();
    setWorkspaceDraft(request.draft || '');
    setAttachments(request.attachments || []);
    setShowSettingsModal(false); setShowHistoryDrawer(false); setIsTraceExpanded(false);
  }), []);

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatSessions(prev => {
      const remaining = prev.filter(s => s.id !== sessionId);
      if (sessionId === activeSessionId) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          const freshId = `session-${Date.now()}`;
          setActiveSessionId(freshId);
          return [{ id: freshId, title: 'New Conversation', createdAt: Date.now(), time: 'Just now', messages: [] }];
        }
      }
      return remaining;
    });
  };

  const handleTaskSubmit = async (prompt: string, atts: ScreenAttachment[]) => {
    if (isExecuting || sessionState?.status === 'awaiting_tier2') return;

    const userMsg: ChatMessageItem = {
      id: `msg-${Date.now()}-user`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: atts.length > 0 ? [...atts] : undefined,
    };

    const firstThumb = atts.find(a => a.croppedDataUrl)?.croppedDataUrl;
    let targetSessionId = activeSessionId;
    const currentSession = chatSessions.find(s => s.id === activeSessionId);

    if (!currentSession || currentSession.messages.length === 0) {
      const newSessionId = `session-${Date.now()}`;
      targetSessionId = newSessionId;
      const newSession: FullChatSession = {
        id: newSessionId,
        title: prompt.length > 44 ? prompt.slice(0, 44) + '...' : prompt,
        createdAt: Date.now(),
        time: 'Just now',
        thumbnail: firstThumb,
        messages: [userMsg],
      };
      setChatSessions(prev => [newSession, ...prev.filter(s => s.id !== activeSessionId || s.messages.length > 0)]);
      setActiveSessionId(newSessionId);
    } else {
      setChatSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            time: 'Just now',
            thumbnail: s.thumbnail || firstThumb,
            messages: [...s.messages, userMsg],
          };
        }
        return s;
      }));
    }

    const fullPrompt = atts.length > 0
      ? `[${atts.map(a => a.type === 'crop' && a.coords ? `Crop (${a.coords.x},${a.coords.y},${a.coords.w}×${a.coords.h})` : a.label).join(', ')}]: ${prompt}`
      : prompt;

    const images = atts
      .map(a => a.croppedDataUrl)
      .filter((url): url is string => Boolean(url && url.startsWith('data:image/')));

    setAttachments([]);

    try {
      executionSessionRef.current = targetSessionId;
      const history = currentSession?.messages.slice(-10).map(m => ({ role: m.sender, text: m.text }));
      const state = await dispatchTask(fullPrompt, images.length > 0 ? images : undefined, history);
      const resultText = state?.status === 'awaiting_tier2' ? 'Horizon needs your approval before continuing.' : state?.currentNarration || 'No response was returned by the agent. Please try again.';

      const assistantMsg: ChatMessageItem = {
        id: `msg-${Date.now()}-assistant`,
        sender: 'assistant',
        text: resultText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: state?.status === 'error' ? 'error' : state?.status === 'awaiting_tier2' ? 'working' : 'done',
      };

      setChatSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            messages: [...s.messages, assistantMsg],
          };
        }
        return s;
      }));
    } catch (e: any) {
      console.error('Task execution error:', e);
      const errorMsg: ChatMessageItem = {
        id: `msg-${Date.now()}-error`,
        sender: 'assistant',
        text: `Error executing task: ${e.message || 'Unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'error',
      };
      setChatSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            messages: [...s.messages, errorMsg],
          };
        }
        return s;
      }));
    }
  };

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [chatSessions, activeSessionId, isExecuting]);

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

  const [currentHash, setCurrentHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Floating Bar Route (Summoned by Win+Shift+C docked above taskbar)
  const isFloatingBarRoute = currentHash.includes('bar');
  if (isFloatingBarRoute) {
    return <FloatingBarWindow isDarkMode={isDarkMode} />;
  }

  const isCaptureOverlayRoute = currentHash.includes('capture');
  if (isCaptureOverlayRoute) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 p-0 m-0 w-screen h-screen overflow-hidden select-none">
        <CaptureOverlayCanvas
          key={captureSequence}
          isDarkMode={isDarkMode}
          screenshotUrl={realScreenshotUrl}
          displayInfo={captureDisplayInfo}
          isFullScreenOverlay={true}
          onExit={() => {
            if (typeof window !== 'undefined' && window.horizonAPI) window.horizonAPI.closeOverlay();
          }}
          onAttachArea={(data) => {
            if (typeof window !== 'undefined' && window.horizonAPI) {
              window.horizonAPI.attachArea(data);
            } else {
              handleAddAttachment(data);
            }
          }}
        />
      </div>
    );
  }

  const activeSession = chatSessions.find(s => s.id === activeSessionId);
  const hasMessages = Boolean(activeSession?.messages.length);

  return (
    <div className={`horizon-app ${window.horizonAPI ? 'native-shell' : ''} ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <header className="app-header">
        <div className="brand-group">
          <button onClick={() => setIsSidebarCollapsed(prev => !prev)} className="icon-button" title="Toggle Sidebar" aria-label="Toggle Sidebar" aria-expanded={!isSidebarCollapsed}><Menu size={18} /></button>
          <div className="brand-mark"><HorizonMark size={34} /></div>
          <span className="brand-name">Project Horizon</span>
          <span className="header-divider" />
          <span className="app-subtitle">Your desktop, in context</span>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowSettingsModal(true)} className="icon-button" title="Preferences" aria-label="Preferences"><Sliders size={17} /></button>
          <button onClick={toggleTheme} className="icon-button" title="Toggle Light / Dark Mode" aria-label="Toggle Light / Dark Mode">{isDarkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
      </header>
      <main className="app-workspace">
        {!isSidebarCollapsed && (
          <aside className="app-sidebar" aria-label="Conversations">
            <button onClick={handleNewChat} className="new-chat-button"><Plus size={17} /><span>New Chat</span><span className="new-chat-plus">+</span></button>
            <div className="sidebar-section-label"><span>Past Chats</span><span>{chatSessions.length}</span></div>
            <div className="session-list">
              {chatSessions.length === 0 && <p className="sidebar-empty">A little space for your next idea.<br />Your conversations will appear here.</p>}
              {chatSessions.map(session => (
                <div key={session.id} className={`session-row ${session.id === activeSessionId ? 'selected' : ''}`}>
                  <button className="session-select" onClick={() => handleSelectSession(session.id)} aria-current={session.id === activeSessionId ? 'page' : undefined}>
                    <MessageSquare size={15} />
                    <span className="session-copy"><span className="session-title">{session.title}</span><span className="session-meta">{session.time} · {session.messages.filter(m => m.sender === 'user').length} prompts</span></span>
                  </button>
                  <button onClick={e => handleDeleteSession(session.id, e)} className="session-delete icon-button" title="Delete chat" aria-label={`Delete chat: ${session.title}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="sidebar-footer">
              <div className="shortcut-card"><div className="shortcut-icon"><Camera size={18} /></div><div><strong>Your desktop, in context</strong><span>{hotkeyStatus.active ? 'Summon Horizon from anywhere' : 'Shortcut not active'}</span></div><kbd>{hotkeyStatus.label.replaceAll(' ', '')}</kbd></div>
              <button className="sidebar-utility" onClick={() => setShowSettingsModal(true)} title="Open Preferences & Controls"><Sliders size={16} />Preferences</button>
              <button className="sidebar-utility" onClick={() => setShowHistoryDrawer(true)} title="Open Session History"><History size={16} />Session history</button>
              <div className="sidebar-bottom"><button onClick={() => setShowConsentModal(true)}>Privacy Agreement</button><span><ShieldCheck size={12} />Local history</span></div>
            </div>
          </aside>
        )}
        <section className="chat-workspace" aria-label="Chat workspace">
          <div className="conversation-header"><div><span className="conversation-eyebrow">WORKSPACE</span><h2>{activeSession?.title || 'New Conversation'}</h2></div><span className="model-pill"><Sparkles size={13} />Gemini</span></div>
          <div ref={feedRef} className={`conversation-feed ${hasMessages ? '' : 'empty-feed'}`}>
            {!hasMessages && (
              <div className="welcome">
                <div className="welcome-mark"><HorizonMark size={76} /></div>
                <span className="pixel-eyebrow">YOUR DESKTOP. A NEW HORIZON.</span>
                <h1>See it. Ask it.<br />Let Horizon handle it.</h1>
                <p>Circle any part of your screen, then tell Horizon what you need.<br />Understand what's there, find your files, or take the next step.</p>
                <div className="suggestion-grid">
                  <button className="suggestion-card" onClick={handleTriggerLasso}><span className="suggestion-icon"><Camera size={20} /></span><strong>Start with your screen</strong><span>Circle something. Get clarity.</span><ArrowUpRight size={15} className="suggestion-arrow" /></button>
                  <button className="suggestion-card" onClick={() => handleTaskSubmit('Help me find a project on my computer', [])}><span className="suggestion-icon"><Code2 size={20} /></span><strong>Find your workspace</strong><span>Pick up where you left off.</span><ArrowUpRight size={15} className="suggestion-arrow" /></button>
                  <button className="suggestion-card" onClick={() => handleTaskSubmit('What desktop tasks can you help me with?', [])}><span className="suggestion-icon"><Layers size={20} /></span><strong>Make a little progress</strong><span>Explore what Horizon can do.</span><ArrowUpRight size={15} className="suggestion-arrow" /></button>
                </div>
                <div className="welcome-note"><ShieldCheck size={14} />You stay in control. Sensitive actions need your approval.</div>
              </div>
            )}
            {activeSession?.messages.map(msg => (
              <article key={msg.id} className={`chat-message ${msg.sender}`}>
                <div className="message-heading">{msg.sender === 'assistant' ? <><HorizonMark size={17} /><strong>Horizon</strong></> : <strong>You</strong>}<time>{msg.timestamp}</time></div>
                {msg.attachments && msg.attachments.length > 0 && <div className="message-attachments">{msg.attachments.map(att => <div key={att.id} className="message-attachment">{att.croppedDataUrl && <img src={att.croppedDataUrl} alt={att.label} />}<span><Camera size={13} />{att.label}</span></div>)}</div>}
                <div className={`message-body ${msg.status === 'error' ? 'message-error' : ''}`}>{msg.text}</div>
              </article>
            ))}
            {(isExecuting || sessionState?.status === 'working') && <div className="working-indicator" role="status"><HorizonMark size={18} /><span>{sessionState?.currentNarration || 'Thinking through your task…'}</span><span className="working-dots">···</span></div>}
          </div>
          <div className="composer-dock">
            {(sessionState || isExecuting) && <div className="trace-dock">{isTraceExpanded && <div className="trace-expanded"><ReActTracePanel isDarkMode={isDarkMode} steps={liveTraceSteps} onClose={() => setIsTraceExpanded(false)} /></div>}<HUDCollapsedChip isDarkMode={isDarkMode} isExpanded={isTraceExpanded} onToggleLogs={() => setIsTraceExpanded(prev => !prev)} currentNarration={sessionState?.currentNarration} status={sessionState?.status} /></div>}
            {lastError && <p role="alert" className="text-xs text-rose-400 mb-2">{lastError}</p>}
            {(hotkeyError || consentError) && !showConsentModal && <div role="alert" className="text-xs text-rose-300 mb-3">{hotkeyError || consentError} <button className="underline" onClick={() => setShowSettingsModal(true)}>Open Preferences</button></div>}
            <ContextualPromptBar key={composerVersion} initialPrompt={workspaceDraft} isDarkMode={isDarkMode} attachments={attachments} onRemoveAttachment={handleRemoveAttachment} onClearAttachments={handleClearAttachments} onTriggerLasso={handleTriggerLasso} onTriggerFullScreen={handleQuickFullScreenCapture} onSubmitPrompt={handleTaskSubmit} isBusy={isExecuting || sessionState?.status === 'awaiting_tier2'} />
            <div className="composer-hint"><span>Give it context. Let Horizon help.</span><span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span></div>
          </div>
        </section>
        {isCaptureActive && !window.horizonAPI && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm p-4"><CaptureOverlayCanvas isDarkMode={isDarkMode} screenshotUrl={realScreenshotUrl} displayInfo={captureDisplayInfo} onExit={() => setIsCaptureActive(false)} onAttachArea={handleAddAttachment} /></div>}
      </main>

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
                submitTier2Decision(sessionState.pendingTier2.actionId, true).catch(() => {});
              }
              setShowTier2Modal(false);
            }}
            onDeny={() => {
              if (sessionState?.pendingTier2) {
                submitTier2Decision(sessionState.pendingTier2.actionId, false).catch(() => {});
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

      {/* First-Run Consent & Hotkey Approval Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative">
            <FirstRunConsentModal 
              isDarkMode={isDarkMode} 
              isBusy={savingConsent}
              error={consentError}
              shortcutLabel={hotkeyStatus.label}
              onConsentGiven={handleConsentGiven}
              onConsentDeclined={() => setShowConsentModal(false)}
            />
          </div>
        </div>
      )}

      {/* Session History & Follow-Up Drawer (Slide in from right) */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md h-full shadow-2xl animate-slide-in">
            <SessionHistoryDrawer isDarkMode={isDarkMode} sessions={chatSessions} onSelectSession={id => { handleSelectSession(id); setShowHistoryDrawer(false); }} />
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
