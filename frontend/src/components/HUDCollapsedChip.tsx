import React, { useState, useEffect } from 'react';
import { ChevronDown, Minus } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface HUDCollapsedChipProps {
  isDarkMode: boolean;
  onExpandTrace?: () => void;
  isExpanded?: boolean;
  onToggleLogs?: () => void;
  currentNarration?: string;
  toolCategory?: string;
}

export const HUDCollapsedChip: React.FC<HUDCollapsedChipProps> = ({ 
  isDarkMode, 
  onExpandTrace,
  isExpanded = false,
  onToggleLogs,
  currentNarration,
  toolCategory = "search"
}) => {
  const [category, setCategory] = useState(toolCategory);
  const [narrationIdx, setNarrationIdx] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  const narrations = [
    "Analyzing GLSL vertex error via Gemini Vision...",
    "Resolving uniforms in shaders/liquid.frag...",
    "Attaching VS Code process window...",
    "Applying hot-reload GLSL patch in sandbox..."
  ];

  useEffect(() => {
    if (currentNarration) return;
    const interval = setInterval(() => {
      setNarrationIdx(prev => (prev + 1) % narrations.length);
    }, 3600);
    return () => clearInterval(interval);
  }, [currentNarration]);

  if (isMinimized) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMinimized(false)}
          className="px-4 py-2 rounded-full border border-[#8CC1E9]/40 bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] text-xs font-semibold flex items-center gap-2 hover:bg-[#8CC1E9]/25 transition-all shadow-md"
        >
          <GeminiSparkle size={14} />
          <span>Restore Gemini Pill</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div 
        className={`w-[500px] max-w-[94vw] rounded-full p-2.5 sm:px-4 border shadow-2xl transition-all relative overflow-hidden ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/40' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/40'
        }`}
      >
        {/* Shimmer traveling border cycling through #8CC1E9, #438BC4, #0055A0, and #FFF8E7 */}
        <div className="absolute inset-0 pointer-events-none shimmer-horizon animate-shimmer opacity-55" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          {/* Tool Category & Celestial Animated Icon */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 relative bg-gradient-to-tr from-[#12284B] via-[#0055A0] to-[#438BC4] border border-[#8CC1E9]/60 shadow-inner">
              <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-[#8CC1E9]" />
              <GeminiSparkle size={18} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#0055A0] dark:text-[#8CC1E9] font-bold">
                  GEMINI THINKING
                </span>
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8CC1E9] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#FFF8E7]"></span>
                </span>
              </div>
              <div className="text-xs sm:text-sm font-medium truncate text-slate-800 dark:text-slate-100 transition-all duration-300">
                {currentNarration || narrations[narrationIdx]}
              </div>
            </div>
          </div>

          {/* Controls: View / Collapse Logs (collapsed by default) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onToggleLogs || onExpandTrace}
              className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all shadow-sm ${
                isExpanded
                  ? 'border-[#8CC1E9] bg-[#8CC1E9]/25 text-[#0055A0] dark:text-[#8CC1E9]'
                  : 'border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-carbon-850 text-slate-700 dark:text-slate-200 hover:border-[#8CC1E9]'
              }`}
            >
              <span>{isExpanded ? 'Collapse Logs' : 'View Logs'}</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-full text-slate-400 hover:text-[#FFF8E7] hover:bg-[#438BC4]/20 transition-colors"
              title="Minimize HUD"
            >
              <Minus size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Category Toggle Pills */}
      <div className="flex items-center gap-1.5 p-1 rounded-full border border-slate-200 dark:border-slate-800 text-xs bg-slate-100/70 dark:bg-carbon-850">
        <span className="text-[10px] font-medium text-slate-400 uppercase px-2">Tool:</span>
        {['search', 'click', 'launch', 'type', 'hotkey'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded-full capitalize text-xs transition-all ${
              category === cat 
                ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] font-bold shadow-md shadow-[#438BC4]/35 border border-[#FFF8E7]/30' 
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0055A0] dark:hover:text-[#8CC1E9]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
};
