import sharp from 'sharp';
import { clamp } from '@/lib/shared/composition';
import { LIGHT_WRAP_RADIUS_PX, LIGHT_WRAP_STRENGTH } from '@/lib/constants';
import type { PlacementResult } from './types';

/**
 * Apply light wrap — bleed backdrop edge colours onto the subject outline.
 *
 * This creates the impression that ambient light from the backdrop is wrapping
 * around the subject edges, improving compositing realism.
 *
 * Algorithm:
 *  1. Extract the backdrop crop aligned with the subject's placement rect.
 *  2. Heavily blur the crop (LIGHT_WRAP_RADIUS_PX × 4) to get a colour wash.
 *  3. Create an edge mask: dilate the subject alpha by LIGHT_WRAP_RADIUS_PX,
 *     then subtract the original alpha — leaving only the fringe ring.
 *  4. Multiply the blurred backdrop by the edge mask.
 *  5. Composite the result onto the subject at LIGHT_WRAP_STRENGTH opacity.
 *
 * Returns the modified subject buffer (same dimensions as input).
 */
export async function applyLightWrap(
  subjectBuffer: Buffer,
  backdropBuffer: Buffer,
  placement: PlacementResult,
  outputWidth: number,
  outputHeight: number,
): Promise<Buffer> {
  const { width: subjW, height: subjH } = placement;

  // ── Step 1: extract the backdrop region behind the subject ───────────────
  const cropLeft = clamp(placement.left, 0, outputWidth - 1);
  const cropTop = clamp(placement.top, 0, outputHeight - 1);
  const cropW = clamp(
    Math.min(subjW, outputWidth - cropLeft),
    1,
    outputWidth,
  );
  const cropH = clamp(
    Math.min(subjH, outputHeight - cropTop),
    1,
    outputHeight,
  );

  if (cropW <= 0 || cropH <= 0) {
    return subjectBuffer;
  }

  // Crop and resize to exactly match the subject dimensions
  const backdropCrop = await sharp(backdropBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize({ width: subjW, height: subjH, fit: 'fill', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ── Step 2: heavily blur the backdrop crop ───────────────────────────────
  const blurPx = LIGHT_WRAP_RADIUS_PX * 4; // 32px blur wash
  const blurredCropPng = await sharp(backdropCrop.data, {
    raw: {
      width: backdropCrop.info.width,
      height: backdropCrop.info.height,
      channels: backdropCrop.info.channels,
    },
  })
    .blur(Math.max(1, blurPx))
    .png()
    .toBuffer();

  // ── Step 3: build edge mask = dilated alpha − original alpha ─────────────
  const subjRaw = await sharp(subjectBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: subjData, info: subjInfo } = subjRaw;
  const ch = subjInfo.channels;

  // Dilated alpha: for each pixel, alpha = max alpha within LIGHT_WRAP_RADIUS_PX neighbours
  const dilatedAlpha = new Uint8Array(subjInfo.width * subjInfo.height);
  for (let y = 0; y < subjInfo.height; y++) {
    for (let x = 0; x < subjInfo.width; x++) {
      let maxA = 0;
      const r = LIGHT_WRAP_RADIUS_PX;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= subjInfo.width || ny < 0 || ny >= subjInfo.height) continue;
          const a = subjData[(ny * subjInfo.width + nx) * ch + 3] ?? 0;
          if (a > maxA) maxA = a;
        }
      }
      dilatedAlpha[y * subjInfo.width + x] = maxA;
    }
  }

  // Edge mask = dilated - original (clamped to 0-255)
  const edgeMask = new Uint8Array(subjInfo.width * subjInfo.height);
  for (let i = 0; i < edgeMask.length; i++) {
    const orig = subjData[i * ch + 3] ?? 0;
    const dilated = dilatedAlpha[i] ?? 0;
    edgeMask[i] = clamp(dilated - orig, 0, 255);
  }

  // ── Step 4: blurred backdrop × edge mask ────────────────────────────────
  const blurredRaw = await sharp(blurredCropPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: blurData, info: blurInfo } = blurredRaw;
  const blurCh = blurInfo.channels;
  const wrapData = Buffer.from(blurData);

  for (let i = 0; i < subjInfo.width * subjInfo.height; i++) {
    const mask = edgeMask[i] ?? 0;
    const maskFrac = mask / 255;
    // Preserve RGB from backdrop, set alpha = mask * LIGHT_WRAP_STRENGTH
    wrapData[i * blurCh + 3] = Math.round(
      (blurData[i * blurCh + 3] ?? 255) * maskFrac * LIGHT_WRAP_STRENGTH,
    );
  }

  const wrapLayer = await sharp(wrapData, {
    raw: { width: blurInfo.width, height: blurInfo.height, channels: blurCh },
  })
    .png()
    .toBuffer();

  // ── Step 5: composite wrap layer onto subject ────────────────────────────
  return sharp(subjectBuffer)
    .ensureAlpha()
    .composite([{ input: wrapLayer, left: 0, top: 0, blend: 'over' }])
    .png()
    .toBuffer();
}
