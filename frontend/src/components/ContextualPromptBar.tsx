import React, { useState } from 'react';
import { Mic, ArrowRight } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface ContextualPromptBarProps {
  isDarkMode: boolean;
  onSubmitPrompt?: (prompt: string) => void;
}

export const ContextualPromptBar: React.FC<ContextualPromptBarProps> = ({ 
  isDarkMode, 
  onSubmitPrompt 
}) => {
  const [promptText, setPromptText] = useState("");
  const [submittedMsg, setSubmittedMsg] = useState("");

  const handleExecute = (txt?: string) => {
    const val = txt || promptText;
    if (!val.trim()) return;
    if (onSubmitPrompt) {
      onSubmitPrompt(val);
    }
    setSubmittedMsg(`Dispatched task to Gemini 2.5: "${val}"`);
    setTimeout(() => setSubmittedMsg(""), 3500);
  };

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-3">
      <div 
        className={`w-full p-2.5 rounded-3xl border shadow-2xl transition-all relative ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/30' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/40'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="p-2 flex-shrink-0 animate-pulse">
            <GeminiSparkle size={22} />
          </div>
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder="Ask Gemini to inspect, refactor, or automate..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 font-normal focus:ring-0"
          />
          <button 
            onClick={() => alert("Voice input active: Gemini listening...")}
            className="p-2 text-slate-400 hover:text-[#8CC1E9] transition-colors" 
            title="Dictate with voice"
          >
            <Mic size={17} />
          </button>
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

        {/* 3 Gemini Prompt Suggestions */}
        <div className="flex items-center gap-2 mt-2 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 overflow-x-auto pb-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#0055A0] dark:text-[#8CC1E9] pl-1 flex-shrink-0">
            Suggested:
          </span>
          {[
            "Fix GLSL shader error", 
            "Explain compilation logs", 
            "Generate WebGL unit test"
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
