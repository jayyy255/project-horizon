import React, { useState, useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';
import { ContextualPromptBar, ScreenAttachment } from './ContextualPromptBar';
import { useHorizonAgent } from '../hooks/useHorizonAgent';

interface FloatingBarWindowProps {
  isDarkMode: boolean;
}

export const FloatingBarWindow: React.FC<FloatingBarWindowProps> = ({ isDarkMode }) => {
  const [attachments, setAttachments] = useState<ScreenAttachment[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const { sessionState, isExecuting, dispatchTask } = useHorizonAgent();

  // Listen for screen region attached from overlay
  useEffect(() => {
    if (typeof window !== 'undefined' && window.horizonAPI) {
      const unsub = window.horizonAPI.onAreaAttached((data) => {
        console.log('[FloatingBar] Area attached from overlay:', data);
        if (data) {
          const newAtt: ScreenAttachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            label: data.label || 'Screen Selection',
            type: data.type === 'fullscreen' ? 'fullscreen' : 'crop',
            coords: data.coords,
            croppedDataUrl: data.croppedDataUrl || data.dataUrl,
            timestamp: Date.now(),
          };
          setAttachments(prev => [...prev, newAtt]);
        }
      });
      return () => unsub();
    }
  }, []);

  const handleTriggerLasso = () => {
    if (typeof window !== 'undefined' && window.horizonAPI?.triggerCapture) {
      window.horizonAPI.triggerCapture();
    } else if (typeof window !== 'undefined' && window.horizonAPI?.toggleOverlay) {
      window.horizonAPI.toggleOverlay();
    }
  };

  const handleQuickFullScreenCapture = async () => {
    if (typeof window !== 'undefined' && window.horizonAPI) {
      try {
        const data = await window.horizonAPI.captureDesktop();
        if (data && data.dataUrl) {
          const newAtt: ScreenAttachment = {
            id: `att-${Date.now()}`,
            label: data.displayLabel || 'Full Desktop',
            type: 'fullscreen',
            coords: { x: 0, y: 0, w: data.width, h: data.height },
            croppedDataUrl: data.dataUrl,
            timestamp: Date.now(),
          };
          setAttachments(prev => [...prev, newAtt]);
        }
      } catch (err) {
        console.warn('Full screen capture error:', err);
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleClearAttachments = () => {
    setAttachments([]);
  };

  const handleExpandToFullApp = () => {
    if (typeof window !== 'undefined' && window.horizonAPI?.openMainWindow) {
      window.horizonAPI.openMainWindow();
    }
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined' && window.horizonAPI?.hideFloatingBar) {
      window.horizonAPI.hideFloatingBar();
    }
  };

  const handleTaskSubmit = (promptText: string, currentAttachments: ScreenAttachment[]) => {
    if (!promptText.trim() && currentAttachments.length === 0) return;

    // 1. Sync with shared localStorage session history store
    try {
      const stored = localStorage.getItem('horizon_chat_sessions');
      let sessions = stored ? JSON.parse(stored) : [];
      const newSessionId = `session-${Date.now()}`;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const userMsg = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        text: promptText,
        attachments: currentAttachments,
        timestamp: timeStr,
      };

      const newSession = {
        id: newSessionId,
        title: promptText.slice(0, 45) || 'Screen Inspection Task',
        time: 'Just now',
        messages: [userMsg],
        thumbnail: currentAttachments[0]?.croppedDataUrl,
      };

      sessions = [newSession, ...sessions];
      localStorage.setItem('horizon_chat_sessions', JSON.stringify(sessions));
      localStorage.setItem('horizon_active_session_id', newSessionId);
    } catch (err) {
      console.warn('[FloatingBar] Failed to persist chat session:', err);
    }

    // 2. Dispatch task to agent
    const imageUrls = currentAttachments
      .map(a => a.croppedDataUrl)
      .filter((u): u is string => Boolean(u));

    dispatchTask(promptText, imageUrls);
    setStatusMessage(`Dispatched: "${promptText.slice(0, 32)}..."`);
    setTimeout(() => setStatusMessage(''), 4000);

    // Clear prompt bar attachments
    setAttachments([]);
  };

  return (
    <div className="w-full h-full p-2 flex flex-col items-center justify-center select-none bg-transparent">
      {/* Floating Capsule Container */}
      <div className={`w-full max-w-2xl rounded-3xl p-3 border shadow-2xl backdrop-blur-2xl transition-all ${
        isDarkMode
          ? 'bg-[#090c13]/95 border-[#8CC1E9]/35 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.7)]'
          : 'bg-white/95 border-[#8CC1E9]/45 text-slate-900 shadow-[0_12px_40px_rgba(0,85,160,0.18)]'
      }`}>
        {/* Top Header Strip: Brand + Controls */}
        <div className="flex items-center justify-between pb-2 mb-1 px-2 border-b border-slate-200/50 dark:border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-[#12284B] via-[#0055A0] to-[#8CC1E9] flex items-center justify-center text-[#FFF8E7] shadow-xs">
              <GeminiSparkle size={12} />
            </div>
            <span className="text-xs font-bold horizon-gradient-text tracking-tight">Project Horizon</span>
            <span className="text-[10px] font-mono text-slate-400">· Fast Bar</span>
            {statusMessage && (
              <span className="text-[10px] text-emerald-400 font-mono truncate max-w-[200px] animate-fade-in">
                {statusMessage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Expand Affordance to Full Window */}
            <button
              onClick={handleExpandToFullApp}
              className="p-1.5 rounded-xl hover:bg-[#8CC1E9]/20 text-slate-400 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-all flex items-center gap-1 text-[11px] font-medium"
              title="Expand to Full Two-Column App"
            >
              <Maximize2 size={13} />
              <span className="text-[10px] hidden sm:inline">Expand</span>
            </button>

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-xl hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition-all"
              title="Dismiss (Esc)"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Floating Bar Prompt Input */}
        <ContextualPromptBar
          isDarkMode={isDarkMode}
          attachments={attachments}
          onRemoveAttachment={handleRemoveAttachment}
          onClearAttachments={handleClearAttachments}
          onTriggerLasso={handleTriggerLasso}
          onTriggerFullScreen={handleQuickFullScreenCapture}
          onSubmitPrompt={handleTaskSubmit}
          hideSuggestions={true}
        />

        {/* Working Status / Agent Narration Chip if Active */}
        {(isExecuting || sessionState?.status === 'working') && (
          <div className="mt-2 px-3 py-1.5 rounded-2xl bg-[#8CC1E9]/15 border border-[#8CC1E9]/30 flex items-center justify-between text-xs animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#8CC1E9] animate-ping flex-shrink-0" />
              <span className="text-[11px] font-mono truncate text-[#0055A0] dark:text-[#8CC1E9]">
                {sessionState?.currentNarration || 'Formulating agent plan...'}
              </span>
            </div>
            <button
              onClick={handleExpandToFullApp}
              className="text-[10px] text-[#438BC4] hover:underline font-semibold flex-shrink-0 ml-2"
            >
              View in Full App &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
