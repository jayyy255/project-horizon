import React, { useState, useEffect } from 'react';
import { RotateCcw, Lasso, Monitor } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';
import { captureRealDesktop } from '../utils/capture';

interface CaptureOverlayCanvasProps {
  isDarkMode: boolean;
  onExit?: () => void;
  onAttachArea?: (data: { type: 'crop' | 'fullscreen'; label: string; coords?: { x: number; y: number; w: number; h: number } }) => void;
  screenshotUrl?: string | null;
  displayInfo?: { width: number; height: number; scaleFactor?: number; label?: string } | null;
}

export const CaptureOverlayCanvas: React.FC<CaptureOverlayCanvasProps> = ({ 
  isDarkMode, 
  onExit,
  onAttachArea,
  screenshotUrl,
  displayInfo
}) => {
  const [showAABB, setShowAABB] = useState(true);
  const [realScreenshot, setRealScreenshot] = useState<string | null>(screenshotUrl || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureDetails, setCaptureDetails] = useState<{ width: number; height: number; label: string } | null>(
    displayInfo ? { width: displayInfo.width, height: displayInfo.height, label: displayInfo.label || 'Primary Display' } : null
  );

  const simulatedCoords = { x: 1420, y: 860, w: 420, h: 260 };

  useEffect(() => {
    if (screenshotUrl) {
      setRealScreenshot(screenshotUrl);
    }
  }, [screenshotUrl]);

  useEffect(() => {
    if (displayInfo) {
      setCaptureDetails({ width: displayInfo.width, height: displayInfo.height, label: displayInfo.label || 'Primary Display' });
    }
  }, [displayInfo]);

  // When running inside Electron, grab actual screenshot of the real desktop via desktopCapturer + getUserMedia
  useEffect(() => {
    if (typeof window !== 'undefined' && window.horizonAPI && !realScreenshot) {
      setIsCapturing(true);
      captureRealDesktop()
        .then((result) => {
          setRealScreenshot(result.dataUrl);
          setCaptureDetails({
            width: result.width,
            height: result.height,
            label: result.sourceName,
          });
          setIsCapturing(false);
        })
        .catch((err) => {
          console.warn('[CaptureOverlayCanvas] desktopCapturer + getUserMedia fallback:', err);
          setIsCapturing(false);
        });
    }
  }, [realScreenshot]);

  return (
    <div className="w-full max-w-4xl relative rounded-3xl overflow-hidden border border-[#8CC1E9]/35 dark:border-slate-800 shadow-2xl">
      {/* Desktop Background Canvas / Real Captured Screenshot */}
      <div 
        className="w-full h-[460px] relative select-none transition-colors overflow-hidden"
        style={{
          background: isDarkMode 
            ? 'radial-gradient(ellipse at 60% 40%, #12284B 0%, #090a0d 100%)' 
            : 'radial-gradient(ellipse at 60% 40%, #ffffff 0%, #f0f6fa 100%)'
        }}
      >
        {/* Real Captured Desktop Bitmap (Actual live desktop pixels) */}
        {realScreenshot ? (
          <img 
            src={realScreenshot} 
            alt="Real Desktop Capture" 
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none brightness-95 animate-fade-in"
          />
        ) : (
          /* Subtle Grid Pattern fallback if loading or in standalone web mode */
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(to right, ${isDarkMode ? '#8CC1E9' : '#0055A0'} 1px, transparent 1px), linear-gradient(to bottom, ${isDarkMode ? '#8CC1E9' : '#0055A0'} 1px, transparent 1px)`,
              backgroundSize: '24px 24px'
            }}
          />
        )}

        {/* Real Screen Capture Indicator Badge */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8CC1E9] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-[#8CC1E9] via-[#438BC4] to-[#FFF8E7]"></span>
          </span>
          <span className={`px-3 py-1 rounded-full text-[11px] font-mono tracking-wide border flex items-center gap-2 backdrop-blur-md ${
            isDarkMode ? 'liquid-glass-dark text-slate-200 border-[#8CC1E9]/30 shadow-lg' : 'liquid-glass-light text-slate-800 font-medium shadow-sm border-[#8CC1E9]/40'
          }`}>
            <GeminiSparkle size={13} />
            <span>
              {isCapturing ? (
                'Capturing real Windows desktop...'
              ) : realScreenshot && captureDetails ? (
                `Real Desktop Captured · ${captureDetails.width}×${captureDetails.height}px (${captureDetails.label})`
              ) : (
                'Screen Capture Active · Select or Circle Area'
              )}
            </span>
          </span>
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
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Catmull-Rom smooth freehand stroke */}
            <path
              d="M 160 110 C 220 90, 480 80, 540 120 C 580 150, 570 300, 530 330 C 470 360, 220 370, 150 330 C 110 300, 110 150, 160 110 Z"
              fill="rgba(140, 193, 233, 0.08)"
              stroke="url(#horizonLassoGrad)"
              strokeWidth="2.5"
              filter="url(#horizonGlow)"
              className="animate-pulse"
            />

            {/* Bounding Box (AABB + 12px padding) */}
            <rect
              x="128"
              y="78"
              width="434"
              height="284"
              fill="none"
              stroke="#8CC1E9"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              className="opacity-80"
            />
          </svg>
        )}

        {/* Anchored Capture Toolbar */}
        <div className={`absolute top-4 right-4 z-30 flex items-center gap-2 p-1.5 rounded-2xl border shadow-xl backdrop-blur-md ${
          isDarkMode ? 'liquid-glass-dark text-slate-200 border-[#8CC1E9]/30' : 'liquid-glass-light text-slate-800 border-[#8CC1E9]/35'
        }`}>
          {onAttachArea && (
            <>
              {showAABB && (
                <button
                  onClick={() => onAttachArea({ 
                    type: 'crop', 
                    label: 'Screen Crop', 
                    coords: captureDetails ? { x: 128, y: 78, w: 434, h: 284 } : simulatedCoords 
                  })}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] flex items-center gap-1.5 shadow-md shadow-[#438BC4]/30 hover:brightness-110 transition-all border border-[#FFF8E7]/30"
                >
                  <GeminiSparkle size={12} />
                  <span>Attach Selection</span>
                </button>
              )}
              <button
                onClick={() => onAttachArea({ 
                  type: 'fullscreen', 
                  label: 'Full Screen', 
                  coords: captureDetails ? { x: 0, y: 0, w: captureDetails.width, h: captureDetails.height } : { x: 0, y: 0, w: 1920, h: 1080 } 
                })}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-300 dark:border-slate-700 hover:border-[#8CC1E9] text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5"
              >
                <Monitor size={12} />
                <span>Attach Full Screen</span>
              </button>
            </>
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
              <span>Redraw Lasso</span>
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
