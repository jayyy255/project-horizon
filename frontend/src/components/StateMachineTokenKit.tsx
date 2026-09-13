import React, { useState } from 'react';
import { Check, XCircle, AlertTriangle, Sparkles, Palette } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface StateMachineTokenKitProps {
  isDarkMode: boolean;
}

export const StateMachineTokenKit: React.FC<StateMachineTokenKitProps> = ({ 
  isDarkMode 
}) => {
  const [testedState, setTestedState] = useState<"idle" | "working" | "done" | "error" | "risk">("working");

  const getStatePreviewStyle = () => {
    switch(testedState) {
      case 'idle':
        return 'border-slate-300 dark:border-slate-700 text-slate-400';
      case 'working':
        return 'border-[#8CC1E9]/90 shadow-[0_0_30px_rgba(140,193,233,0.4)]';
      case 'done':
        return 'animate-flash-success border-[#8CC1E9]';
      case 'error':
        return 'border-slate-400/90 shadow-[0_0_30px_rgba(148,163,184,0.3)]';
      case 'risk':
        return 'border-[#FFF8E7]/90 shadow-[0_0_30px_rgba(255,248,231,0.4)]';
      default:
        return '';
    }
  };

  return (
    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Interactive State Tester */}
      <div 
        className={`p-6 rounded-3xl border shadow-2xl transition-all ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <GeminiSparkle size={16} />
            <h3 className="text-xs font-bold uppercase tracking-wide horizon-gradient-text">Gemini 5-State Machine</h3>
          </div>
          <span className="font-mono text-[10px] text-[#438BC4]">INTERACTIVE_TEST</span>
        </div>

        {/* State Picker Buttons */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {[
            { id: "idle", label: "Idle Standby" },
            { id: "working", label: "Working Shimmer" },
            { id: "done", label: "Done (Flash)" },
            { id: "error", label: "Error (Muted)" },
            { id: "risk", label: "Risk (Ivory)" },
          ].map(st => (
            <button
              key={st.id}
              onClick={() => setTestedState(st.id as typeof testedState)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                testedState === st.id
                  ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-md shadow-[#438BC4]/30 border border-[#FFF8E7]/30'
                  : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-carbon-850 text-slate-600 dark:text-slate-300 hover:border-[#8CC1E9]/50'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Live Rendered State Container */}
        <div className={`p-4 rounded-3xl border-2 transition-all duration-300 relative overflow-hidden ${
          isDarkMode ? 'bg-[#090a0d]' : 'bg-white'
        } ${getStatePreviewStyle()}`}>
          {testedState === 'working' && (
            <div className="absolute inset-0 pointer-events-none shimmer-horizon animate-shimmer opacity-55" />
          )}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs ${
                testedState === 'done' ? 'bg-[#8CC1E9]/25 text-[#8CC1E9] border border-[#8CC1E9]/50' :
                testedState === 'error' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/40' :
                testedState === 'risk' ? 'bg-[#FFF8E7]/25 text-[#FFF8E7] border border-[#FFF8E7]/50' :
                'bg-[#12284B] text-[#FFF8E7] border border-[#8CC1E9]/50'
              }`}>
                {testedState === 'working' ? (
                  <GeminiSparkle size={18} />
                ) : testedState === 'done' ? (
                  <Check size={16} />
                ) : testedState === 'error' ? (
                  <XCircle size={16} />
                ) : testedState === 'risk' ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
              </div>
              <div>
                <div className="font-mono text-xs font-bold uppercase tracking-wide">
                  State: {testedState.toUpperCase()}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {testedState === 'working' && 'Multi-stop shimmer: #8CC1E9 -> #438BC4 -> #0055A0 -> #FFF8E7'}
                  {testedState === 'done' && 'Transient 1.5s celestial confirmation bloom'}
                  {testedState === 'error' && 'Persistent status border with retry action'}
                  {testedState === 'risk' && 'Warm cosmic ivory glow requesting Tier 2 approval'}
                  {testedState === 'idle' && 'Horizon sleeping in quiet standby'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Liquid Glass CSS Token Cheat Sheet */}
      <div 
        className={`p-6 rounded-3xl border shadow-2xl transition-all ${
          isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-[#8CC1E9]" />
            <h3 className="text-xs font-bold uppercase tracking-wide horizon-gradient-text">Gemini Dual-Mode Design Tokens</h3>
          </div>
          <span className="font-mono text-[10px] text-[#8CC1E9]">HORIZON_v8.0</span>
        </div>

        <div className="space-y-3 font-mono text-[11px]">
          {/* Palette Tokens */}
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850">
            <div className="flex items-center justify-between text-[#0055A0] dark:text-[#8CC1E9] font-bold mb-1">
              <span>Horizon 5-Color Family Tokens</span>
              <span className="text-[10px] uppercase opacity-75">CORE_SPEC</span>
            </div>
            <div className="text-slate-600 dark:text-slate-400 space-y-0.5">
              <div>--cosmic-ivory: #FFF8E7 (Warm Soft Cream)</div>
              <div>--celestial-cyan: #8CC1E9 (Soft Sky Cyan-Blue)</div>
              <div>--midnight-navy: #12284B (Deep Midnight Navy)</div>
              <div>--classic-cobalt: #0055A0 (Google Classic Cobalt)</div>
              <div>--cerulean-blue: #438BC4 (Rich Cerulean Blue)</div>
            </div>
          </div>

          {/* Mode Specifications */}
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850">
            <div className="flex items-center justify-between text-[#FFF8E7] font-bold mb-1">
              <span>Surface Background Modes (Preserved)</span>
              <span className="text-[10px] uppercase opacity-75">DUAL_SURFACE</span>
            </div>
            <div className="text-slate-600 dark:text-slate-400 space-y-0.5">
              <div>Dark Canvas: #090a0d / #0e1117 (Satin Matte Carbon Black)</div>
              <div>Light Canvas: #ffffff / #f8fafc (Pure Crisp Porcelain White)</div>
              <div>Lasso &amp; Shimmer: #8CC1E9 -&gt; #438BC4 -&gt; #0055A0 -&gt; #FFF8E7</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
