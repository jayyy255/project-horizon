import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Monitor, Crop, Check, X } from 'lucide-react';
import { HorizonMark } from './HorizonMark';
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
    if (typeof window !== 'undefined' && window.horizonAPI && !realScreenshot && !isFullScreenOverlay) {
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
    if (e.target instanceof Element && e.target.closest('button')) return;
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
    if (e.target instanceof Element && e.target.closest('button')) return;
    if (e.button !== 0 || isDrawing) return;
    const pt = getRelativeCoords(e);
    if (!pt) return;

    setIsDrawing(true);
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
    <div className={`capture-shell ${isDarkMode ? '' : 'light-mode'} ${isFullScreenOverlay ? 'capture-fullscreen' : 'capture-preview'}`}>
      <div ref={containerRef} className="capture-canvas"
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {realScreenshot && <img ref={imgRef} src={realScreenshot} alt="Real Desktop Capture" className="capture-desktop" />}
        <div className="capture-shade" />
        <header className="capture-topbar">
          <div className="capture-brand"><HorizonMark size={24} /><div><strong>Screen context</strong><span>{isCapturing ? 'Capturing your screen…' : 'Circle what you want to ask about'}</span></div></div>
          <button onClick={onExit} className="capture-dismiss" aria-label="Exit capture mode"><kbd>Esc</kbd><X size={16} /></button>
        </header>
        <svg className="capture-selection" aria-hidden="true">
          {svgPath && <path d={svgPath} fill="rgba(140,193,233,.10)" stroke="#8cc1e9" strokeWidth="2.5" />}
          {boundingBox && boundingBox.w > 0 && boundingBox.h > 0 && <rect x={boundingBox.x} y={boundingBox.y} width={boundingBox.w} height={boundingBox.h} rx="8" fill="none" stroke="#8cc1e9" strokeWidth="1" strokeDasharray="5 5" />}
        </svg>
        {points.length === 0 && <div className="capture-instruction"><Crop size={20} /><strong>Circle an area</strong><span>Click and drag around anything on your screen.</span></div>}
        <footer className="capture-toolbar" onClick={e => e.stopPropagation()}>
          <div className="capture-summary"><span>{boundingBox ? 'Area selected' : 'Choose your context'}</span><small>{boundingBox ? `${boundingBox.w} × ${boundingBox.h} px` : 'Nothing is sent until you ask Horizon.'}</small></div>
          {points.length > 0 && <button onClick={handleClearLasso} title="Clear current selection"><RotateCcw size={14} />Clear</button>}
          {onAttachArea && <>
            <button disabled={!realScreenshot} onClick={handleAttachFullScreen}><Monitor size={15} />Full screen</button>
            <button className="capture-primary" disabled={!boundingBox || isDrawing || !realScreenshot} onClick={handleAttachSelection}><Check size={15} />Use selection</button>
          </>}
        </footer>
      </div>
    </div>
  );
};
