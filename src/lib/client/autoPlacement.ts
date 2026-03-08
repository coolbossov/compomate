'use client';
import type { CompositionState } from '@/lib/shared/composition';
import { clamp } from '@/lib/shared/composition';
import type { Asset } from '@/types/files';
import { estimatePoseFromObjectUrl } from './mediapipe';

// Pixel centroid fallback — scan image pixels
async function centroidFallback(
  objectUrl: string,
): Promise<{ feetYPct: number; centerXPct: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      // Downsample to max 400px on the longest side before scanning pixels
      // to avoid freezing on large images (e.g. 4000×3000 = 12M iterations).
      const MAX_SCAN_PX = 400;
      const scale = Math.min(1, MAX_SCAN_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const scanW = Math.round(img.naturalWidth * scale);
      const scanH = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = scanW;
      canvas.height = scanH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, scanW, scanH);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minY = canvas.height,
        maxY = 0,
        sumX = 0,
        count = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha > 30) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            sumX += x;
            count++;
          }
        }
      }
      // minY intentionally computed (suppress unused-var lint via void)
      void minY;
      resolve(
        count > 0
          ? {
              feetYPct: maxY / canvas.height,
              centerXPct: sumX / count / canvas.width,
            }
          : { feetYPct: 0.92, centerXPct: 0.5 },
      );
    };
    img.onerror = () => resolve({ feetYPct: 0.92, centerXPct: 0.5 });
    img.src = objectUrl;
  });
}

export async function computeAutoPlacement(
  subject: Asset,
): Promise<Partial<CompositionState>> {
  // Calculate subjectHeightPct from the image aspect ratio, matching the
  // formula used by the manual "Auto Place + Blend" button in ControlPanel.
  // Falls back to 64 if dimensions are unavailable.
  const subjectHeightPct =
    subject.width > 0 && subject.height > 0
      ? Math.round(clamp(62 + (0.52 - subject.width / subject.height) * 26, 48, 82))
      : 64;

  // Try MediaPipe first
  const pose = await estimatePoseFromObjectUrl(subject.objectUrl);
  if (pose) {
    return {
      xPct: Math.round(pose.hipCenterXPct * 100),
      yPct: Math.round(pose.feetYPct * 84 + 10), // map feet to ~84% canvas bottom
      subjectHeightPct,
    };
  }
  // Centroid fallback
  const { feetYPct, centerXPct } = await centroidFallback(subject.objectUrl);
  return {
    xPct: Math.round(centerXPct * 100),
    yPct: Math.round(feetYPct * 84 + 10),
    subjectHeightPct,
  };
}
