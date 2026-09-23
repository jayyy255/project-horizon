import React, { useState, useRef, useEffect } from 'react';
import { Mic, ArrowRight, Camera, Crop, Monitor, X } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

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
  onSubmitPrompt?: (prompt: string, attachments: ScreenAttachment[]) => void;
  attachments?: ScreenAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments?: () => void;
  onTriggerLasso?: () => void;
  onTriggerFullScreen?: () => void;
}

export const ContextualPromptBar: React.FC<ContextualPromptBarProps> = ({ 
  isDarkMode, 
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
    if (!val.trim() && attachments.length === 0) return;
    const finalTxt = val.trim() || (attachments.length > 0 ? "Analyze attached screen area" : "");
    if (onSubmitPrompt) {
      onSubmitPrompt(finalTxt, attachments);
    }
    setSubmittedMsg(`Dispatched task to Gemini 2.5: "${finalTxt}"`);
    setTimeout(() => setSubmittedMsg(""), 3500);
    setPromptText("");
  };

  return (
    <div 
      id="horizon-chat-container" 
      className="w-full max-w-2xl flex flex-col items-center gap-2.5"
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
        className={`w-full p-2.5 rounded-3xl border shadow-2xl transition-all relative ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/40' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/45'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Gemini Sparkle */}
          <div className="p-2 flex-shrink-0 animate-pulse">
            <GeminiSparkle size={22} />
          </div>

          {/* Main Prompt Input */}
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder={
              attachments.length > 0 
                ? `Ask Gemini about ${attachments.length === 1 ? 'this screen attachment' : `${attachments.length} attachments`}...` 
                : "Ask Gemini to inspect, refactor, or automate..."
            }
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 font-normal focus:ring-0"
          />

          {/* Screen Capture Options (Circle Area / Full Screen) */}
          <div className="relative" ref={captureMenuRef}>
            <button
              onClick={() => setShowCaptureMenu(prev => !prev)}
              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold border ${
                attachments.length > 0 
                  ? 'border-[#8CC1E9] bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9]' 
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-[#8CC1E9] hover:border-[#8CC1E9]'
              }`}
              title="Screen Capture: Circle an area or select full screen"
            >
              <Camera size={14} />
              <span className="hidden sm:inline">Screen Capture</span>
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
                      <span className="text-[10px] text-slate-400">Select bounding box / lasso</span>
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

          {/* Dictate / Voice Input */}
          <button 
            onClick={() => alert("Voice input active: Gemini listening...")}
            className="p-2 text-slate-400 hover:text-[#8CC1E9] transition-colors" 
            title="Dictate with voice"
          >
            <Mic size={17} />
          </button>

          {/* Send / Generate Prompt */}
          <button
            onClick={() => handleExecute()}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-lg border ${
              isDarkMode 
                ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] hover:brightness-110 shadow-[0_4px_16px_rgba(67,139,196,0.35)] border-[#FFF8E7]/30' 
                : 'bg-gradient-to-r from-[#12284B] via-[#0055A0] to-[#438BC4] text-[#FFF8E7] hover:brightness-105 shadow-[0_4px_16px_rgba(18,40,75,0.25)] border-[#8CC1E9]/50'
            }`}
          >
            <span>Generate</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Prompt Suggestions */}
        <div className="flex items-center gap-2 mt-2 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 overflow-x-auto pb-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#0055A0] dark:text-[#8CC1E9] pl-1 flex-shrink-0">
            Suggested:
          </span>
          {[
            "open vs", 
            "Explain this screen area", 
            "query and prepare graph"
          ].map((pill, idx) => (
            <button
              key={idx}
              onClick={() => {
                setPromptText(pill);
                handleExecute(pill);
              }}
              className="px-3 py-1 rounded-full text-xs whitespace-nowrap bg-slate-100 hover:bg-[#8CC1E9]/20 text-slate-700 dark:bg-slate-800/70 dark:hover:bg-[#438BC4]/25 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:border-[#8CC1E9] dark:hover:border-[#8CC1E9]/60 transition-all font-medium"
            >
              {pill}
            </button>
          ))}
        </div>
      </div>

      {submittedMsg && (
        <div className="text-xs font-medium text-[#0055A0] dark:text-[#8CC1E9] flex items-center gap-2 animate-bounce">
          <GeminiSparkle size={14} />
          <span>{submittedMsg}</span>
        </div>
      )}
    </div>
  );
};
