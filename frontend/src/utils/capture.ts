/**
 * Real Desktop Capture Utility for Project Horizon
 * Uses Electron desktopCapturer sources + WebRTC getUserMedia
 * to capture live Windows desktop frames at native resolution.
 */

export interface DesktopScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
  sourceId: string;
  sourceName: string;
}

export async function captureRealDesktop(): Promise<DesktopScreenshotResult> {
  if (typeof window === 'undefined' || !window.horizonAPI) {
    throw new Error('desktopCapturer requires the Electron desktop environment.');
  }

  // 1. Get desktop screen sources from Electron main process
  const sources = await window.horizonAPI.getDesktopSources();
  if (!sources || sources.length === 0) {
    throw new Error('No desktop screen sources found.');
  }

  const screenSource = sources.find((s) => s.id.startsWith('screen')) || sources[0];

  // 2. Request real desktop video stream via getUserMedia
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: screenSource.id,
        minWidth: 1280,
        maxWidth: 3840,
        minHeight: 720,
        maxHeight: 2160,
      },
    } as any,
  });

  // 3. Render single frame to offscreen canvas
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.style.display = 'none';
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play().catch(reject);
      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to create canvas 2d context for desktop capture');
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');

          // Release video stream tracks
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;

          console.log(
            `[Project Horizon] Real desktop capture frame grabbed: ${canvas.width}x${canvas.height}px (${Math.round(
              dataUrl.length / 1024
            )} KB)`
          );

          resolve({
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            sourceId: screenSource.id,
            sourceName: screenSource.name,
          });
        } catch (err) {
          stream.getTracks().forEach((track) => track.stop());
          reject(err);
        }
      }, 150);
    };

    video.onerror = (err) => {
      stream.getTracks().forEach((track) => track.stop());
      reject(err);
    };
  });
}
