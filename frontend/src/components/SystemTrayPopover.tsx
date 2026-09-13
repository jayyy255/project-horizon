import React, { useState } from 'react';
import { Play, Pause, Layout, History, Sliders, Power } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface SystemTrayPopoverProps {
  isDarkMode: boolean;
  onOpenHUD?: () => void;
  onOpenHistory?: () => void;
  onOpenPreferences?: () => void;
  onQuit?: () => void;
}

export const SystemTrayPopover: React.FC<SystemTrayPopoverProps> = ({ 
  isDarkMode,
  onOpenHUD,
  onOpenHistory,
  onOpenPreferences,
  onQuit
}) => {
  const [trayState, setTrayState] = useState<"idle" | "active" | "paused" | "error">("active");

  const getOrbStyle = () => {
    switch(trayState) {
      case 'active': return 'bg-gradient-to-r from-[#8CC1E9] via-[#438BC4] to-[#FFF8E7] shadow-[0_0_12px_#8CC1E9] animate-pulse';
      case 'paused': return 'bg-[#FFF8E7] shadow-[0_0_12px_#FFF8E7] border border-[#438BC4]';
      case 'error': return 'bg-slate-400 shadow-[0_0_12px_#94a3b8]';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div 
        className={`w-[310px] rounded-3xl p-4 border shadow-2xl transition-all ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
        }`}
      >
        {/* Header with Orb & Quick Pause */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <span className={`w-3.5 h-3.5 rounded-full ${getOrbStyle()} transition-all`} />
            <div>
              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Project Horizon</span>
                <GeminiSparkle size={12} />
              </div>
              <div className="text-[10px] font-mono text-slate-400 capitalize">Gemini Agent: {trayState}</div>
            </div>
          </div>
          <button
            onClick={() => setTrayState(s => s === 'paused' ? 'active' : 'paused')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-all ${
              trayState === 'paused'
                ? 'bg-[#FFF8E7]/25 text-[#12284B] dark:text-[#FFF8E7] border-[#438BC4]/50'
                : 'hover:bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9] border-[#8CC1E9]/40'
            }`}
          >
            {trayState === 'paused' ? <Play size={11} /> : <Pause size={11} />}
            <span>{trayState === 'paused' ? "Resume" : "Pause"}</span>
          </button>
        </div>

        {/* Menu Items */}
        <div className="py-2.5 space-y-1 text-xs">
          <button 
            onClick={onOpenHUD || (() => alert("Open Horizon HUD"))}
            className="w-full px-3 py-2 rounded-2xl flex items-center gap-2.5 hover:bg-[#8CC1E9]/15 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-colors text-left font-medium"
          >
            <Layout size={15} className="text-[#438BC4]" />
            <span>Open Agent HUD</span>
          </button>
          <button 
            onClick={onOpenHistory || (() => alert("Session History Opened"))}
            className="w-full px-3 py-2 rounded-2xl flex items-center gap-2.5 hover:bg-[#8CC1E9]/15 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-colors text-left font-medium"
          >
            <History size={15} className="text-[#438BC4]" />
            <span>Session History</span>
          </button>
          <button 
            onClick={onOpenPreferences || (() => alert("Gemini Preferences"))}
            className="w-full px-3 py-2 rounded-2xl flex items-center gap-2.5 hover:bg-[#8CC1E9]/15 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-colors text-left font-medium"
          >
            <Sliders size={15} className="text-[#438BC4]" />
            <span>Preferences &amp; Sandbox</span>
          </button>
        </div>

        {/* Subtle Gradient Line */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8CC1E9]/50 to-transparent my-1" />

        {/* Quit with Soft Hover State */}
        <button 
          onClick={onQuit || (() => alert("Horizon Process Terminated"))}
          className="w-full px-3 py-2 rounded-2xl flex items-center gap-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors text-left font-medium"
        >
          <Power size={15} />
          <span>Quit Horizon Agent</span>
        </button>
      </div>

      {/* Tray State Tester */}
      <div className="flex items-center gap-1.5 p-1 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-carbon-850 text-xs">
        <span className="text-[10px] font-medium text-slate-400 uppercase px-2">Orb:</span>
        {(['idle', 'active', 'paused', 'error'] as const).map(st => (
          <button
            key={st}
            onClick={() => setTrayState(st)}
            className={`px-3 py-1 rounded-full capitalize text-xs transition-all ${
              trayState === st 
                ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] font-bold border border-[#FFF8E7]/30 shadow-md shadow-[#438BC4]/30' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'
            }`}
          >
            {st}
          </button>
        ))}
      </div>
    </div>
  );
};
