import sharp from 'sharp';
import { clamp, wrapDegrees } from '@/lib/shared/composition';
import { EXPORT_DPI } from '@/lib/constants';
import { normalizeSubject, normalizeBackdrop } from './normalize';
import { calculatePlacement } from './placement';
import { defringeSubject } from './defringe';
import { applyLightWrap } from './lightwrap';
import { createReflection } from './reflect';
import { renderNameOverlay } from './text';
import type { CompositorInput, CompositorOutput } from './types';

// ── Local helpers (ported from route.ts) ────────────────────────────────────

function buildFogOverlaySvg(
  canvasWidth: number,
  canvasHeight: number,
  fogOpacityPct: number,
  fogHeightPct: number,
): Buffer {
  const opacity = clamp(fogOpacityPct / 100, 0, 1);
  const fogHeight = clamp(Math.round(canvasHeight * (fogHeightPct / 100)), 1, canvasHeight);
  const fogStartY = canvasHeight - fogHeight;
  const ellipseY = fogStartY + Math.round(fogHeight * 0.38);

  const svg = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fog-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(238,242,255,0)" />
          <stop offset="58%" stop-color="rgba(238,242,255,0)" />
          <stop offset="100%" stop-color="rgba(238,242,255,${opacity.toFixed(3)})" />
        </linearGradient>
        <filter id="fog-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect x="0" y="${fogStartY}" width="${canvasWidth}" height="${fogHeight}" fill="url(#fog-grad)" />
      <ellipse cx="${Math.round(canvasWidth / 2)}" cy="${ellipseY}"
        rx="${Math.round(canvasWidth * 0.42)}" ry="${Math.round(fogHeight * 0.22)}"
        fill="rgba(247,249,255,${(opacity * 0.72).toFixed(3)})" filter="url(#fog-blur)" />
    </svg>
  `;

  return Buffer.from(svg);
}

async function applyLegFadeToBuffer(
  subjectPng: Buffer,
  fadeStartPct: number,
): Promise<Buffer> {
  const { data, info } = await sharp(subjectPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const fadeStart = clamp(Math.round(height * (fadeStartPct / 100)), 0, height);
  const output = Buffer.from(data);

  for (let y = 0; y < height; y++) {
    const alphaMultiplier =
      y < fadeStart ? 1 : 1 - (y - fadeStart) / Math.max(1, height - fadeStart);
    const mult = clamp(alphaMultiplier, 0, 1);
    for (let x = 0; x < width; x++) {
      const aIdx = (y * width + x) * channels + 3;
      output[aIdx] = Math.round((data[aIdx] ?? 0) * mult);
    }
  }

  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}

// ── Main compositor pipeline ─────────────────────────────────────────────────

/**
 * Run the full Sharp compositing pipeline for a single subject+backdrop pair.
 *
 * Step order:
 *  1.  normalizeSubject — RGBA sRGB PNG, validate dimensions
 *  2.  normalizeBackdrop — cover-fit to outputWidth×outputHeight
 *  3.  Size subject to subjectHeightPct of output canvas
 *  4.  analyzeSubjectPose — pixel-scan for placement metadata
 *  5.  calculatePlacement — convert xPct/yPct to pixel coordinates
 *  6.  Apply leg fade (if enabled) — modifies subject alpha
 *  7.  defringeSubject — 1px alpha erosion to remove colour fringe
 *  8.  applyLightWrap — blend backdrop edge colours onto subject outline
 *  9.  createReflection — 5-layer progressive blur, full-canvas buffer
 *  10. Composite onto backdrop: reflection → subject → fog
 *  11. renderNameOverlay (if enabled)
 *  12. toFormat('png') with 300 DPI metadata
 */
export async function runCompositorPipeline(
  input: CompositorInput,
): Promise<CompositorOutput> {
  const { composition, outputWidth, outputHeight, nameOverlay, fontBasePath } = input;

  // Clamp all composition controls
  const comp = {
    ...composition,
    xPct: clamp(composition.xPct, 5, 95),
    yPct: clamp(composition.yPct, 25, 96),
    subjectHeightPct: clamp(composition.subjectHeightPct, 20, 95),
    reflectionPositionPct: clamp(composition.reflectionPositionPct, 65, 140),
    reflectionOpacityPct: clamp(composition.reflectionOpacityPct, 0, 100),
    reflectionBlurPx: clamp(composition.reflectionBlurPx, 0, 20),
    legFadeStartPct: clamp(composition.legFadeStartPct, 35, 98),
    fogOpacityPct: clamp(composition.fogOpacityPct, 0, 100),
    fogHeightPct: clamp(composition.fogHeightPct, 6, 80),
    shadowStrengthPct: clamp(composition.shadowStrengthPct, 0, 100),
    lightDirectionDeg: wrapDegrees(composition.lightDirectionDeg),
    lightElevationDeg: clamp(composition.lightElevationDeg, 5, 85),
    shadowStretchPct: clamp(composition.shadowStretchPct, 35, 250),
    shadowBlurPx: clamp(composition.shadowBlurPx, 0, 40),
  };

  // ── 1. Normalize inputs ──────────────────────────────────────────────────
  const [normalizedSubject, normalizedBackdrop] = await Promise.all([
    normalizeSubject(input.subjectBuffer),
    normalizeBackdrop(input.backdropBuffer, outputWidth, outputHeight),
  ]);

  // ── 3. Resize subject to subjectHeightPct of canvas ─────────────────────
  const targetSubjectHeight = clamp(
    Math.round(outputHeight * (comp.subjectHeightPct / 100)),
    64,
    outputHeight,
  );

  const sizedSubjectPng = await sharp(normalizedSubject)
    .resize({
      width: outputWidth,
      height: targetSubjectHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const sizedMeta = await sharp(sizedSubjectPng).metadata();
  const subjectWidth = sizedMeta.width;
  const subjectHeight = sizedMeta.height;
  if (!subjectWidth || !subjectHeight) {
    throw new Error('Unable to process subject image dimensions.');
  }

  // ── 4. Pose analysis (metadata for future auto-placement) ────────────────
  // analyzeSubjectPose is called for diagnostics; placement is driven by xPct/yPct
  // (we don't use its output for placement in the default pipeline)
  // const _poseMetrics = await analyzeSubjectPose(sizedSubjectPng);

  // ── 5. Calculate placement ───────────────────────────────────────────────
  const placement = calculatePlacement(
    subjectWidth,
    subjectHeight,
    outputWidth,
    outputHeight,
    comp,
  );

  // ── 6. Leg fade (modifies subject alpha before compositing) ──────────────
  const legFadedPng = comp.legFadeEnabled
    ? await applyLegFadeToBuffer(sizedSubjectPng, comp.legFadeStartPct)
    : sizedSubjectPng;

  // ── 7. Defringe ──────────────────────────────────────────────────────────
  const defringedPng = await defringeSubject(legFadedPng, 1);

  // ── 8. Light wrap ────────────────────────────────────────────────────────
  const lightWrappedPng = await applyLightWrap(
    defringedPng,
    normalizedBackdrop,
    placement,
    outputWidth,
    outputHeight,
  );

  // ── 9. Reflection (full-canvas buffer) ──────────────────────────────────
  const reflectionCanvas = comp.reflectionEnabled && comp.reflectionSizePct > 0
    ? await createReflection(lightWrappedPng, comp, outputWidth, outputHeight, placement)
    : null;

  // ── 10. Build composite layer list ──────────────────────────────────────
  const overlays: sharp.OverlayOptions[] = [];

  // a. Reflection first (renders below subject)
  if (reflectionCanvas) {
    overlays.push({ input: reflectionCanvas, left: 0, top: 0, blend: 'over' });
  }

  // b. Subject at placement
  overlays.push({
    input: lightWrappedPng,
    left: Math.round(placement.left),
    top: Math.round(placement.top),
    blend: 'over',
  });

  // c. Fog overlay
  if (comp.fogEnabled && comp.fogOpacityPct > 0) {
    overlays.push({
      input: buildFogOverlaySvg(outputWidth, outputHeight, comp.fogOpacityPct, comp.fogHeightPct),
      left: 0,
      top: 0,
    });
  }

  // Composite onto backdrop
  let canvasBuffer = await sharp(normalizedBackdrop)
    .ensureAlpha()
    .composite(overlays)
    .toColorspace('srgb')
    .png()
    .toBuffer();

  // ── 11. Name overlay ────────────────────────────────────────────────────
  if (nameOverlay?.enabled) {
    canvasBuffer = await renderNameOverlay(
      canvasBuffer,
      nameOverlay,
      outputWidth,
      outputHeight,
      fontBasePath,
    );
  }

  // ── 12. Final encode at 300 DPI ─────────────────────────────────────────
  const finalBuffer = await sharp(canvasBuffer)
    .toColorspace('srgb')
    .withMetadata({ density: EXPORT_DPI })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    buffer: finalBuffer,
    width: outputWidth,
    height: outputHeight,
    format: 'png',
  };
}
