import React, { useState } from 'react';
import { RotateCcw, Lasso } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface CaptureOverlayCanvasProps {
  isDarkMode: boolean;
  onExit?: () => void;
  onAttachArea?: (coords: { x: number; y: number; w: number; h: number }) => void;
}

export const CaptureOverlayCanvas: React.FC<CaptureOverlayCanvasProps> = ({ 
  isDarkMode, 
  onExit,
  onAttachArea
}) => {
  const [showAABB, setShowAABB] = useState(true);
  const simulatedCoords = { x: 1420, y: 860, w: 420, h: 260 };

  return (
    <div className="w-full max-w-4xl relative rounded-3xl overflow-hidden border border-[#8CC1E9]/35 dark:border-slate-800 shadow-2xl">
      {/* Simulated DXGI Desktop Background Canvas */}
      <div 
        className="w-full h-[380px] relative p-5 select-none transition-colors"
        style={{
          background: isDarkMode 
            ? 'radial-gradient(ellipse at 60% 40%, #12284B 0%, #090a0d 100%)' 
            : 'radial-gradient(ellipse at 60% 40%, #ffffff 0%, #f0f6fa 100%)'
        }}
      >
        {/* Grid Pattern overlay */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, ${isDarkMode ? '#8CC1E9' : '#0055A0'} 1px, transparent 1px), linear-gradient(to bottom, ${isDarkMode ? '#8CC1E9' : '#0055A0'} 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        {/* Frozen Frame Banner with Celestial/Cosmic Status */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8CC1E9] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-[#8CC1E9] via-[#438BC4] to-[#FFF8E7]"></span>
          </span>
          <span className={`px-3 py-1 rounded-full text-[11px] font-mono tracking-wide border flex items-center gap-2 ${
            isDarkMode ? 'liquid-glass-dark text-slate-200 border-[#8CC1E9]/30' : 'liquid-glass-light text-slate-800 font-medium shadow-sm border-[#8CC1E9]/40'
          }`}>
            <GeminiSparkle size={13} />
            <span>GEMINI_SURFACE // FROZEN FRAME [2560×1440 @ 144Hz]</span>
          </span>
        </div>

        {/* Simulated Window behind the lasso */}
        <div className={`absolute top-16 left-12 w-[340px] h-[190px] rounded-2xl border p-3.5 backdrop-blur-md transition-colors ${
          isDarkMode ? 'border-slate-700/60 bg-[#0e1117]/85 text-slate-300 shadow-xl' : 'border-slate-200/90 bg-white/90 text-slate-700 shadow-md'
        }`}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8CC1E9]/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#438BC4]/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFF8E7] border border-slate-400" />
            <span className="text-[10px] font-mono text-slate-400 ml-2">Terminal — npm run build:glsl</span>
          </div>
          <div className="font-mono text-[10px] space-y-1">
            <div className="opacity-70">&gt; shaders/liquid.frag:142:18</div>
            <div className="text-[#8CC1E9] font-medium">ERROR: syntax error: unexpected token 'vec3'</div>
            <div className="text-[#FFF8E7] opacity-90">Compilation failed with 1 error, 0 warnings.</div>
          </div>
        </div>

        {/* SVG Catmull-Rom Smooth Neon Lasso Curve: #8CC1E9 -> #438BC4 -> #0055A0 -> #FFF8E7 */}
        {showAABB && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            <defs>
              <linearGradient id="horizonLassoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8CC1E9" />
                <stop offset="35%" stopColor="#438BC4" />
                <stop offset="70%" stopColor="#0055A0" />
                <stop offset="100%" stopColor="#FFF8E7" />
              </linearGradient>
              <filter id="horizonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Smooth lasso loop encircling target */}
            <path
              d="M 68 85 C 90 60, 220 50, 390 62 C 430 65, 420 140, 410 220 C 400 270, 250 280, 110 270 C 50 265, 50 120, 68 85 Z"
              fill="none"
              stroke="url(#horizonLassoGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#horizonGlow)"
            />
          </svg>
        )}

        {/* Bounding Box with 12px padding with Cyan / Cobalt Dashed Accent */}
        {showAABB && (
          <div 
            className="absolute z-20 pointer-events-none rounded-2xl border-2 border-dashed border-[#8CC1E9]/85 shadow-[0_0_28px_rgba(67,139,196,0.45)]"
            style={{
              top: '52px',
              left: '48px',
              width: '380px',
              height: '232px'
            }}
          >
            {/* Coordinate Pill with Multi-Stop Gradient */}
            <div className="absolute -top-7 left-0 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wide bg-gradient-to-r from-[#12284B] via-[#0055A0] to-[#438BC4] text-[#FFF8E7] border border-[#8CC1E9]/50 shadow-md flex items-center gap-1.5">
              <GeminiSparkle size={10} />
              <span>CROP: [{simulatedCoords.x}, {simulatedCoords.y}] · 12px PAD · 420×260px</span>
            </div>
          </div>
        )}

        {/* Anchored Capture Toolbar */}
        <div className={`absolute top-4 right-4 z-30 flex items-center gap-2 p-1.5 rounded-2xl border shadow-xl ${
          isDarkMode ? 'liquid-glass-dark text-slate-200 border-[#8CC1E9]/30' : 'liquid-glass-light text-slate-800 border-[#8CC1E9]/35'
        }`}>
          {showAABB && onAttachArea && (
            <button
              onClick={() => onAttachArea(simulatedCoords)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] flex items-center gap-1.5 shadow-md shadow-[#438BC4]/30 hover:brightness-110 transition-all border border-[#FFF8E7]/30"
            >
              <GeminiSparkle size={12} />
              <span>Attach to Chat</span>
            </button>
          )}
          {showAABB ? (
            <button
              onClick={() => setShowAABB(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 text-[#0055A0] dark:text-[#8CC1E9] hover:bg-[#8CC1E9]/15 transition-all"
            >
              <RotateCcw size={13} />
              <span>Clear Lasso</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAABB(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 text-[#0055A0] dark:text-[#FFF8E7] hover:bg-[#438BC4]/15 transition-all"
            >
              <Lasso size={13} />
              <span>Redraw Horizon Lasso</span>
            </button>
          )}
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={onExit || (() => alert("Simulated ESC Exit"))}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 text-slate-400 hover:text-[#8CC1E9] transition-colors"
            title="Exit capture mode"
          >
            <kbd className="text-[10px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">ESC</kbd>
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
