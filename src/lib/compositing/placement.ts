import sharp from 'sharp';
import { clamp, type CompositionState } from '@/lib/shared/composition';
import {
  POSE_STANCE_SCAN_START_FRAC,
  POSE_TOP_END_FRAC,
  POSE_BOTTOM_START_FRAC,
  POSE_ALPHA_THRESHOLD,
} from '@/lib/constants';
import type { PlacementResult, PoseMetrics } from './types';

/**
 * Calculate where the subject should be placed on the output canvas.
 * xPct/yPct define the subject's foot position; subject is positioned so its
 * bottom-centre aligns with that point.
 */
export function calculatePlacement(
  subjectWidth: number,
  subjectHeight: number,
  outputWidth: number,
  outputHeight: number,
  composition: CompositionState,
): PlacementResult {
  const footX = Math.round(outputWidth * (composition.xPct / 100));
  const footY = Math.round(outputHeight * (composition.yPct / 100));

  const left = Math.round(footX - subjectWidth / 2);
  const top = Math.round(footY - subjectHeight);

  return { left, top, width: subjectWidth, height: subjectHeight };
}

/**
 * Pixel-scan the subject to estimate foot position, stance width, and lean.
 * Fallback when MediaPipe pose landmarks are unavailable.
 *
 * Returns PoseMetrics with fractional values (0–1) relative to subject dimensions.
 */
export async function analyzeSubjectPose(subjectBuffer: Buffer): Promise<PoseMetrics> {
  const raw = await sharp(subjectBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = raw;
  const { width, height, channels } = info;
  const alphaChannel = channels - 1;

  // ── Foot scan: bottom POSE_STANCE_SCAN_START_FRAC of image ──────────────
  const bottomStart = Math.floor(height * POSE_STANCE_SCAN_START_FRAC);
  let footSumX = 0;
  let footCount = 0;
  let footMinX = width;
  let footMaxX = 0;
  let lowestOpaqueRow = 0;

  for (let y = bottomStart; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + alphaChannel] ?? 0;
      if (alpha < POSE_ALPHA_THRESHOLD) continue;
      footSumX += x;
      footCount++;
      footMinX = Math.min(footMinX, x);
      footMaxX = Math.max(footMaxX, x);
      if (y > lowestOpaqueRow) lowestOpaqueRow = y;
    }
  }

  // ── Lean scan: top vs lower sections ────────────────────────────────────
  const topEnd = Math.max(1, Math.floor(height * POSE_TOP_END_FRAC));
  const lowerStart = Math.floor(height * POSE_BOTTOM_START_FRAC);
  let topX = 0;
  let topCount = 0;
  let bottomX = 0;
  let bottomCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + alphaChannel] ?? 0;
      if (alpha < POSE_ALPHA_THRESHOLD) continue;
      if (y <= topEnd) {
        topX += x;
        topCount++;
      }
      if (y >= lowerStart) {
        bottomX += x;
        bottomCount++;
      }
    }
  }

  const footCenterPx = footCount > 0 ? footSumX / footCount : width / 2;
  const stanceSpan =
    footCount > 0 ? Math.max(1, footMaxX - footMinX) : Math.round(width * 0.38);
  const stanceWidthFrac = clamp(stanceSpan / Math.max(1, width), 0.1, 0.95);

  const topCenter = topCount > 0 ? topX / topCount : width / 2;
  const bottomCenter = bottomCount > 0 ? bottomX / bottomCount : footCenterPx;
  const leanFrac = clamp((topCenter - bottomCenter) / Math.max(1, width), -0.5, 0.5);

  // Lowest opaque row as fraction of image height
  const feetYPct = lowestOpaqueRow > 0 ? lowestOpaqueRow / Math.max(1, height - 1) : 0.98;

  return {
    feetYPct,
    hipCenterXPct: footCenterPx / Math.max(1, width),
    shoulderWidthPct: clamp(stanceWidthFrac * 0.85, 0.08, 0.85), // approximate shoulder ≈ 85% of stance
    stanceWidthPct: stanceWidthFrac,
    leanPct: leanFrac * 2, // scale to [-1, +1] range
  };
}
