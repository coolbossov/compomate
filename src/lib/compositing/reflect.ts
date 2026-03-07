import sharp from 'sharp';
import { clamp, type CompositionState } from '@/lib/shared/composition';
import type { PlacementResult } from './types';

// Progressive blur layers: [blurPx, opacity]
// These correspond to 0–20%, 20–40%, 40–60%, 60–80%, 80–100% of reflection height
const BLUR_LAYERS: Array<{ blurPx: number; opacity: number }> = [
  { blurPx: 2,  opacity: 0.9  },
  { blurPx: 6,  opacity: 0.7  },
  { blurPx: 12, opacity: 0.55 },
  { blurPx: 20, opacity: 0.35 },
  { blurPx: 32, opacity: 0.15 },
];

/**
 * Create a glass-floor reflection with 5-layer progressive blur and gradient fade.
 *
 * Returns a Buffer of the FULL output canvas size (transparent except for the reflection
 * strip). Callers composite this directly onto the backdrop at (0, 0).
 *
 * Algorithm:
 *  1. Find the lowest opaque row (feet) in the subject buffer.
 *  2. Flip the subject vertically.
 *  3. Zero out any pixels in the flipped image that come from *above* the feet in the
 *     original — i.e. rows in the flipped image whose source row was above the foot line.
 *  4. Scale the flipped image to `reflectionSizePct` of the subject.
 *  5. Divide into 5 equal horizontal bands; blur each at a different radius.
 *  6. Multiply each band's alpha by the layer opacity × overall opacity × linear gradient fade.
 *  7. Stitch bands into a single reflection buffer.
 *  8. Place the reflection on a full-canvas transparent buffer.
 */
export async function createReflection(
  subjectBuffer: Buffer,
  composition: CompositionState,
  outputWidth: number,
  outputHeight: number,
  placement: PlacementResult,
): Promise<Buffer> {
  if (!composition.reflectionEnabled || composition.reflectionSizePct <= 0) {
    // Return fully transparent canvas
    return sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }

  const overallOpacity = clamp(composition.reflectionOpacityPct / 100, 0, 1);

  // ── Step 1: read raw pixels to find feet line ───────────────────────────
  const { data: rawData, info: rawInfo } = await sharp(subjectBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: subjW, height: subjH, channels } = rawInfo;
  const ALPHA_THRESHOLD = 16;

  let lowestRow = 0;
  for (let y = subjH - 1; y >= 0; y--) {
    let rowHasPixel = false;
    for (let x = 0; x < subjW; x++) {
      if ((rawData[(y * subjW + x) * channels + 3] ?? 0) >= ALPHA_THRESHOLD) {
        rowHasPixel = true;
        break;
      }
    }
    if (rowHasPixel) {
      lowestRow = y;
      break;
    }
  }

  // ── Step 2 & 3: flip vertically and zero rows above feet ────────────────
  // In the flipped image, row `r` corresponds to original row `(subjH - 1 - r)`.
  // Rows in original that are above `lowestRow` should be zeroed in the reflection.
  const flippedData = Buffer.from(rawData);
  for (let y = 0; y < subjH; y++) {
    const originalRow = subjH - 1 - y;
    if (originalRow < lowestRow) {
      // This row is above the feet line — erase it in the reflection
      for (let x = 0; x < subjW; x++) {
        flippedData[(y * subjW + x) * channels + 3] = 0;
      }
    }
  }

  // Re-encode the masked flipped data as a PNG
  const flippedPng = await sharp(flippedData, {
    raw: { width: subjW, height: subjH, channels },
  })
    .flip() // vertical flip
    .png()
    .toBuffer();

  // ── Step 4: scale to reflectionSizePct ──────────────────────────────────
  const sizeFrac = clamp(composition.reflectionSizePct / 100, 0.01, 3.0);
  const reflW = Math.max(4, Math.round(subjW * sizeFrac));
  const reflH = Math.max(4, Math.min(Math.round(subjH * sizeFrac), outputHeight));

  const scaledPng = await sharp(flippedPng)
    .resize({ width: reflW, height: reflH, fit: 'fill', withoutEnlargement: false })
    .png()
    .toBuffer();

  // ── Steps 5 & 6: per-band blur + opacity ────────────────────────────────
  const bandH = Math.max(1, Math.floor(reflH / BLUR_LAYERS.length));
  const compositeBands: sharp.OverlayOptions[] = [];

  for (let i = 0; i < BLUR_LAYERS.length; i++) {
    const layer = BLUR_LAYERS[i]!;
    const bandTop = i * bandH;
    const bandBottom = i === BLUR_LAYERS.length - 1 ? reflH : (i + 1) * bandH;
    const actualBandH = Math.max(1, bandBottom - bandTop);

    // Apply blur to the full scaled image, then extract this band's strip
    const blurredStrip = await sharp(scaledPng)
      .blur(layer.blurPx > 0 ? Math.min(layer.blurPx, 1000) : 0.3)
      .extract({ left: 0, top: bandTop, width: reflW, height: actualBandH })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Apply opacity per pixel: layer.opacity × overallOpacity × gradient fade
    const { data: stripData, info: stripInfo } = blurredStrip;
    const modifiedStrip = Buffer.from(stripData);

    for (let y = 0; y < stripInfo.height; y++) {
      // Gradient fade: at top of reflection (y=0 globally) → fade=1, at bottom → fade=0
      const globalY = bandTop + y;
      const gradientFade = 1 - globalY / Math.max(1, reflH - 1);
      const alphaMult = layer.opacity * overallOpacity * clamp(gradientFade, 0, 1);

      for (let x = 0; x < stripInfo.width; x++) {
        const aIdx = (y * stripInfo.width + x) * stripInfo.channels + 3;
        const orig = modifiedStrip[aIdx] ?? 0;
        modifiedStrip[aIdx] = Math.round(orig * alphaMult);
      }
    }

    const bandPng = await sharp(modifiedStrip, {
      raw: { width: stripInfo.width, height: stripInfo.height, channels: stripInfo.channels },
    })
      .png()
      .toBuffer();

    compositeBands.push({ input: bandPng, left: 0, top: bandTop });
  }

  // ── Step 7: stitch bands into single reflection buffer ──────────────────
  const reflectionPng = await sharp({
    create: { width: reflW, height: reflH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(compositeBands)
    .png()
    .toBuffer();

  // ── Step 8: place on full canvas ─────────────────────────────────────────
  // Foot position on the canvas
  const footX = placement.left + Math.round(placement.width / 2);
  const footY = placement.top + placement.height;

  // reflectionPositionPct=100 → reflection starts exactly at feet
  const positionOffset = Math.round(
    ((composition.reflectionPositionPct - 100) / 100) * (placement.height * 0.25),
  );
  const reflectionTop = footY + positionOffset;
  const reflectionLeft = Math.round(footX - reflW / 2);

  // Clip to canvas bounds
  const clampedLeft = Math.max(0, reflectionLeft);
  const clampedTop = Math.max(0, reflectionTop);
  const srcLeft = reflectionLeft < 0 ? -reflectionLeft : 0;
  const srcTop = reflectionTop < 0 ? -reflectionTop : 0;
  const visibleW = Math.min(reflW - srcLeft, outputWidth - clampedLeft);
  const visibleH = Math.min(reflH - srcTop, outputHeight - clampedTop);

  if (visibleW <= 0 || visibleH <= 0) {
    return sharp({
      create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
  }

  const croppedReflection =
    srcLeft > 0 || srcTop > 0 || visibleW < reflW || visibleH < reflH
      ? await sharp(reflectionPng)
          .extract({ left: srcLeft, top: srcTop, width: visibleW, height: visibleH })
          .png()
          .toBuffer()
      : reflectionPng;

  return sharp({
    create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: croppedReflection, left: clampedLeft, top: clampedTop }])
    .png()
    .toBuffer();
}
