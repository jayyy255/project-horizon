import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Lasso, Monitor, Crop, Check } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';
import { captureRealDesktop } from '../utils/capture';
import { computeAABB, generateCatmullRomSVGPath, Point, BoundingBox } from '@shared/aabb';

interface CaptureAreaPayload {
  type: 'crop' | 'fullscreen';
  label: string;
  coords?: { x: number; y: number; w: number; h: number };
  croppedDataUrl?: string;
}

interface CaptureOverlayCanvasProps {
  isDarkMode: boolean;
  onExit?: () => void;
  onAttachArea?: (data: CaptureAreaPayload) => void;
  screenshotUrl?: string | null;
  displayInfo?: { width: number; height: number; scaleFactor?: number; label?: string } | null;
  isFullScreenOverlay?: boolean;
}

export const CaptureOverlayCanvas: React.FC<CaptureOverlayCanvasProps> = ({ 
  isDarkMode, 
  onExit,
  onAttachArea,
  screenshotUrl,
  displayInfo,
  isFullScreenOverlay = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [realScreenshot, setRealScreenshot] = useState<string | null>(screenshotUrl || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureDetails, setCaptureDetails] = useState<{ width: number; height: number; label: string } | null>(
    displayInfo ? { width: displayInfo.width, height: displayInfo.height, label: displayInfo.label || 'Primary Display' } : null
  );

  // Interactive Lasso State
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initial demo coordinates if no freehand drawn yet
  const defaultDemoPoints: Point[] = [
    { x: 160, y: 110 },
    { x: 340, y: 85 },
    { x: 540, y: 120 },
    { x: 570, y: 240 },
    { x: 530, y: 330 },
    { x: 360, y: 365 },
    { x: 150, y: 330 },
    { x: 110, y: 220 },
  ];

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

  // Set default demo lasso on mount if in preview mode
  useEffect(() => {
    if (!isFullScreenOverlay && points.length === 0 && !hasDrawn) {
      setPoints(defaultDemoPoints);
      const initialAABB = computeAABB(defaultDemoPoints, 12);
      setBoundingBox(initialAABB);
    }
  }, [isFullScreenOverlay]);

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

  // Helper to extract relative cursor coordinates
  const getRelativeCoords = useCallback((e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    return { x, y };
  }, []);

  // Freehand Lasso Interaction Handlers (Pointer & Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left click / primary pointer
    if (e.button !== 0) return;
    const pt = getRelativeCoords(e);
    if (!pt) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture unsupported
    }

    setIsDrawing(true);
    setHasDrawn(true);
    setPoints([pt]);
    setBoundingBox(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const pt = getRelativeCoords(e);
    if (!pt) return;

    setPoints((prev) => {
      if (prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      const distSq = (pt.x - last.x) ** 2 + (pt.y - last.y) ** 2;
      // Throttle points: minimum 4px movement to maintain smooth Catmull-Rom curvature
      if (distSq >= 16) {
        const next = [...prev, pt];
        // Compute live AABB with 12px padding while drawing
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const liveAABB = computeAABB(next, 12, { width: rect.width, height: rect.height });
          setBoundingBox(liveAABB);
        }
        return next;
      }
      return prev;
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    setIsDrawing(false);

    if (points.length >= 2 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const finalAABB = computeAABB(points, 12, { width: rect.width, height: rect.height });
      setBoundingBox(finalAABB);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isDrawing) return;
    const pt = getRelativeCoords(e);
    if (!pt) return;

    setIsDrawing(true);
    setHasDrawn(true);
    setPoints([pt]);
    setBoundingBox(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const pt = getRelativeCoords(e);
    if (!pt) return;

    setPoints((prev) => {
      if (prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      const distSq = (pt.x - last.x) ** 2 + (pt.y - last.y) ** 2;
      if (distSq >= 16) {
        const next = [...prev, pt];
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const liveAABB = computeAABB(next, 12, { width: rect.width, height: rect.height });
          setBoundingBox(liveAABB);
        }
        return next;
      }
      return prev;
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (points.length >= 2 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const finalAABB = computeAABB(points, 12, { width: rect.width, height: rect.height });
      setBoundingBox(finalAABB);
    }
  };

  const handleClearLasso = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPoints([]);
    setBoundingBox(null);
    setHasDrawn(false);
  };

  const handleResetDemoLasso = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPoints(defaultDemoPoints);
    setBoundingBox(computeAABB(defaultDemoPoints, 12));
    setHasDrawn(true);
  };

  // Crops the real desktop image using an offscreen canvas at native pixel density
  const createCroppedImage = useCallback(async (cropBox: BoundingBox): Promise<string | undefined> => {
    if (!realScreenshot || cropBox.w <= 0 || cropBox.h <= 0) return undefined;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          if (!containerRef.current) {
            resolve(undefined);
            return;
          }
          const displayRect = containerRef.current.getBoundingClientRect();
          const scaleX = img.naturalWidth / displayRect.width;
          const scaleY = img.naturalHeight / displayRect.height;

          const sx = Math.round(cropBox.x * scaleX);
          const sy = Math.round(cropBox.y * scaleY);
          const sw = Math.round(cropBox.w * scaleX);
          const sh = Math.round(cropBox.h * scaleY);

          // Native physical pixel density
          offscreen.width = Math.max(1, sw);
          offscreen.height = Math.max(1, sh);
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve(offscreen.toDataURL('image/png'));
          } else {
            resolve(undefined);
          }
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = realScreenshot;
    });
  }, [realScreenshot]);

  const handleAttachSelection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAttachArea) return;

    if (boundingBox && boundingBox.w > 0 && boundingBox.h > 0) {
      const croppedDataUrl = await createCroppedImage(boundingBox);
      onAttachArea({
        type: 'crop',
        label: `Area [${boundingBox.w}×${boundingBox.h}px]`,
        coords: boundingBox,
        croppedDataUrl,
      });
    } else {
      handleAttachFullScreen(e);
    }
  };

  const handleAttachFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAttachArea) return;
    const w = captureDetails?.width || (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const h = captureDetails?.height || (typeof window !== 'undefined' ? window.innerHeight : 1080);
    onAttachArea({
      type: 'fullscreen',
      label: 'Entire Display',
      coords: { x: 0, y: 0, w, h },
      croppedDataUrl: realScreenshot || undefined,
    });
  };

  const svgPath = points.length >= 2 ? generateCatmullRomSVGPath(points, !isDrawing) : '';

  return (
    <div 
      className={
        isFullScreenOverlay 
          ? 'fixed inset-0 w-screen h-screen z-50 overflow-hidden select-none bg-black/90 cursor-crosshair'
          : 'w-full max-w-4xl relative rounded-3xl overflow-hidden border border-[#8CC1E9]/35 dark:border-slate-800 shadow-2xl'
      }
    >
      {/* Desktop Background Canvas / Real Captured Screenshot */}
      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`w-full relative select-none transition-colors overflow-hidden touch-none ${
          isFullScreenOverlay ? 'h-screen w-screen' : 'h-[460px] cursor-crosshair'
        }`}
        style={{
          background: isDarkMode 
            ? 'radial-gradient(ellipse at 60% 40%, #12284B 0%, #090a0d 100%)' 
            : 'radial-gradient(ellipse at 60% 40%, #ffffff 0%, #f0f6fa 100%)'
        }}
      >
        {/* Real Captured Desktop Bitmap (Actual live desktop pixels) */}
        {realScreenshot ? (
          <img 
            ref={imgRef}
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
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5 pointer-events-none">
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
                `Desktop Capture · ${captureDetails.width}×${captureDetails.height}px (${captureDetails.label})`
              ) : (
                'Lasso Active · Click & Drag anywhere to circle'
              )}
            </span>
          </span>
        </div>

        {/* Interactive Freehand Catmull-Rom Curve & AABB Bounding Box */}
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
          {svgPath && (
            <path
              d={svgPath}
              fill="rgba(140, 193, 233, 0.12)"
              stroke="url(#horizonLassoGrad)"
              strokeWidth="2.5"
              filter="url(#horizonGlow)"
              className={isDrawing ? '' : 'animate-pulse'}
            />
          )}

          {/* Bounding Box (AABB + 12px padding per §3.1) */}
          {boundingBox && boundingBox.w > 0 && boundingBox.h > 0 && (
            <g>
              <rect
                x={boundingBox.x}
                y={boundingBox.y}
                width={boundingBox.w}
                height={boundingBox.h}
                fill="none"
                stroke="#8CC1E9"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                className="opacity-90"
              />
              {/* Coordinate Pill Badge */}
              <foreignObject
                x={Math.max(4, boundingBox.x)}
                y={Math.max(4, boundingBox.y - 26)}
                width={Math.max(160, boundingBox.w)}
                height="24"
              >
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0055A0]/80 backdrop-blur-md text-[10px] font-mono text-[#FFF8E7] border border-[#8CC1E9]/40 shadow-sm whitespace-nowrap">
                  <Crop size={10} className="text-[#8CC1E9]" />
                  <span>{boundingBox.w}×{boundingBox.h}px (+12px padding)</span>
                </div>
              </foreignObject>
            </g>
          )}
        </svg>

        {/* Anchored Capture Toolbar */}
        <div 
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-4 right-4 z-30 flex items-center gap-2 p-1.5 rounded-2xl border shadow-2xl backdrop-blur-xl ${
            isDarkMode ? 'liquid-glass-dark text-slate-200 border-[#8CC1E9]/30' : 'liquid-glass-light text-slate-800 border-[#8CC1E9]/35'
          }`}
        >
          {onAttachArea && (
            <>
              {boundingBox && boundingBox.w > 0 && (
                <button
                  onClick={handleAttachSelection}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] flex items-center gap-1.5 shadow-md shadow-[#438BC4]/30 hover:brightness-110 transition-all border border-[#FFF8E7]/30"
                >
                  <Check size={13} />
                  <span>Attach Selection ({boundingBox.w}×{boundingBox.h})</span>
                </button>
              )}
              <button
                onClick={handleAttachFullScreen}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-300 dark:border-slate-700 hover:border-[#8CC1E9] text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5"
              >
                <Monitor size={12} />
                <span>Attach Full Screen</span>
              </button>
            </>
          )}

          {points.length > 0 ? (
            <button
              onClick={handleClearLasso}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 text-[#0055A0] dark:text-[#8CC1E9] hover:bg-[#8CC1E9]/15 transition-all"
              title="Clear current selection"
            >
              <RotateCcw size={13} />
              <span>Clear</span>
            </button>
          ) : (
            <button
              onClick={handleResetDemoLasso}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 text-[#0055A0] dark:text-[#FFF8E7] hover:bg-[#438BC4]/15 transition-all"
              title="Draw sample selection"
            >
              <Lasso size={13} />
              <span>Sample Lasso</span>
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

        {/* Drag Helper Callout for New Users */}
        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className={`px-4 py-2 rounded-2xl border backdrop-blur-md flex items-center gap-2 text-xs font-mono shadow-xl animate-fade-in ${
              isDarkMode ? 'bg-[#0f141c]/80 text-[#8CC1E9] border-[#8CC1E9]/30' : 'bg-white/80 text-[#0055A0] border-[#8CC1E9]/40'
            }`}>
              <Crop size={14} className="animate-spin text-[#8CC1E9]" />
              <span>Click and drag mouse anywhere to circle a region</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
