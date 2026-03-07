'use client';
import type { CompositionState } from '@/lib/shared/composition';
import type { Asset } from '@/types/files';
import { estimatePoseFromObjectUrl } from './mediapipe';

// Pixel centroid fallback — scan image pixels
async function centroidFallback(
  objectUrl: string,
): Promise<{ feetYPct: number; centerXPct: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
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
  // Try MediaPipe first
  const pose = await estimatePoseFromObjectUrl(subject.objectUrl);
  if (pose) {
    return {
      xPct: Math.round(pose.hipCenterXPct * 100),
      yPct: Math.round(pose.feetYPct * 84 + 10), // map feet to ~84% canvas bottom
      subjectHeightPct: 64,
    };
  }
  // Centroid fallback
  const { feetYPct, centerXPct } = await centroidFallback(subject.objectUrl);
  return {
    xPct: Math.round(centerXPct * 100),
    yPct: Math.round(feetYPct * 84 + 10),
    subjectHeightPct: 64,
  };
}
