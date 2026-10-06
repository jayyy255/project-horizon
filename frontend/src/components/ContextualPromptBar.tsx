import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Crop, Monitor, X, Plus, Loader2 } from 'lucide-react';

export interface ScreenAttachment {
  id: string;
  label: string;
  type: 'crop' | 'fullscreen';
  coords?: { x: number; y: number; w: number; h: number };
  croppedDataUrl?: string;
  timestamp?: number;
}

interface ContextualPromptBarProps {
  isDarkMode: boolean;
  isBusy?: boolean;
  onSubmitPrompt?: (prompt: string, attachments: ScreenAttachment[]) => void;
  attachments?: ScreenAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments?: () => void;
  onTriggerLasso?: () => void;
  onTriggerFullScreen?: () => void;
}

export const ContextualPromptBar: React.FC<ContextualPromptBarProps> = ({ 
  isDarkMode, 
  isBusy = false,
  onSubmitPrompt,
  attachments = [],
  onRemoveAttachment,
  onClearAttachments,
  onTriggerLasso,
  onTriggerFullScreen
}) => {
  const [promptText, setPromptText] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");
  const [showCaptureMenu, setShowCaptureMenu] = useState(false);
  const captureMenuRef = useRef<HTMLDivElement>(null);

  // Close capture dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (captureMenuRef.current && !captureMenuRef.current.contains(e.target as Node)) {
        setShowCaptureMenu(false);
      }
    };
    if (showCaptureMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCaptureMenu]);

  const handleExecute = (txt?: string) => {
    const val = txt || promptText;
    if (isBusy || (!val.trim() && attachments.length === 0)) return;
    const finalTxt = val.trim() || (attachments.length > 0 ? "Analyze attached screen area" : "");
    if (onSubmitPrompt) {
      onSubmitPrompt(finalTxt, attachments);
    }
    setSubmittedMsg(`Task submitted to Horizon: "${finalTxt}"`);
    setTimeout(() => setSubmittedMsg(""), 3500);
    setPromptText("");
  };

  return (
    <div 
      id="horizon-chat-container" 
      className="prompt-container w-full flex flex-col items-center gap-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Attached Screen Captures Row (Supports Multiple Attachments) */}
      {attachments.length > 0 && (
        <div className="w-full flex flex-wrap items-center gap-2 px-1 animate-fade-in">
          {attachments.map((att) => (
            <div 
              key={att.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8CC1E9]/15 border border-[#8CC1E9]/50 text-xs font-mono text-[#0055A0] dark:text-[#8CC1E9] shadow-sm backdrop-blur-md transition-all hover:bg-[#8CC1E9]/25"
            >
              {att.croppedDataUrl ? (
                <img
                  src={att.croppedDataUrl}
                  alt="Crop preview"
                  className="w-5 h-5 rounded-md object-cover border border-[#8CC1E9]/40 shadow-xs"
                />
              ) : att.type === 'crop' ? (
                <Crop size={13} className="text-[#438BC4]" />
              ) : (
                <Monitor size={13} className="text-[#438BC4]" />
              )}
              <span className="font-medium">
                {att.type === 'crop' && att.coords 
                  ? `Area [${att.coords.w}×${att.coords.h}px]`
                  : att.label}
              </span>
              {onRemoveAttachment && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAttachment(att.id);
                  }} 
                  className="ml-1 text-slate-400 hover:text-rose-400 font-bold transition-colors p-0.5 rounded-full hover:bg-rose-500/10"
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}

          {attachments.length > 1 && onClearAttachments && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearAttachments();
              }}
              className="text-[11px] text-slate-400 hover:text-rose-400 underline font-medium transition-colors px-1"
            >
              Clear all ({attachments.length})
            </button>
          )}
        </div>
      )}

      {/* Main Glassmorphic Chat Bar */}
      <div 
        className={`prompt-surface w-full transition-all relative ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/40' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/45'
        }`}
      >
        <div className="prompt-layout">
          {/* Main Prompt Input */}
          <textarea
            rows={2}
            aria-label="Message Horizon"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder={
              attachments.length > 0 
                ? `Ask Gemini about ${attachments.length === 1 ? 'this screen attachment' : `${attachments.length} attachments`}...` 
                : "Ask Gemini to inspect, refactor, or automate..."
            }
            className="prompt-input"
          />
          <div className="prompt-toolbar">
          {/* Add Files or Context Options */}
          <div className="relative" ref={captureMenuRef}>
            <button
              onClick={() => setShowCaptureMenu(prev => !prev)}
              className={`px-3 p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold border ${
                attachments.length > 0 
                  ? 'border-[#8CC1E9] bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9]' 
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-[#8CC1E9] hover:border-[#8CC1E9]'
              }`}
              title="Add files or context"
              aria-label="Add screen context"
              aria-expanded={showCaptureMenu}
            >
              <Plus size={14} />
              <span>Add screen context</span>
            </button>

            {/* Screen Capture Dropdown Menu */}
            {showCaptureMenu && (
              <div className={`absolute right-0 bottom-full mb-2 w-52 rounded-2xl border p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-slide-up ${
                isDarkMode ? 'bg-[#0f141c]/95 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-800'
              }`}>
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2.5 py-1">
                  Capture Screen
                </div>
                {onTriggerLasso && (
                  <button
                    onClick={() => {
                      setShowCaptureMenu(false);
                      onTriggerLasso();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-[#8CC1E9]/20 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] flex items-center gap-2 transition-colors"
                  >
                    <Crop size={14} className="text-[#438BC4]" />
                    <div className="flex flex-col">
                      <span className="font-semibold">Circle Area</span>
                      <span className="text-[10px] text-slate-400">Select a region of your screen</span>
                    </div>
                  </button>
                )}
                {onTriggerFullScreen && (
                  <button
                    onClick={() => {
                      setShowCaptureMenu(false);
                      onTriggerFullScreen();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-[#8CC1E9]/20 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] flex items-center gap-2 transition-colors"
                  >
                    <Monitor size={14} className="text-[#438BC4]" />
                    <div className="flex flex-col">
                      <span className="font-semibold">Full Screen</span>
                      <span className="text-[10px] text-slate-400">Attach entire display</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          <span className="prompt-model">Gemini</span>

          {/* Send / Generate Prompt */}
          <button
            onClick={() => handleExecute()}
            disabled={isBusy || (!promptText.trim() && attachments.length === 0)}
            className="prompt-send"
            aria-label="Generate"
            title={isBusy ? 'Working on your task' : 'Send message'}
          >
            <span className="sr-only">Generate</span>
            {isBusy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
          </div>
        </div>


      </div>

      {submittedMsg && (
        <div role="status" className="sr-only">
          <span>{submittedMsg}</span>
        </div>
      )}
    </div>
  );
};
