import sharp from 'sharp';
import { buildNameOverlaySvg } from '@/lib/shared/name-overlay';
import type { NameOverlayConfig } from '@/types/composition';

/**
 * Render a name text overlay onto the composite canvas.
 *
 * Uses the existing buildNameOverlaySvg helper to produce an SVG string, then
 * composites it via Sharp onto the canvas buffer.
 *
 * If `nameOverlay.enabled` is false or both names are empty, the canvas is
 * returned unchanged.
 *
 * Note: `fontBasePath` is accepted for API consistency and future custom-font
 * support; the current SVG renderer uses system fonts (Arial, etc.).
 */
export async function renderNameOverlay(
  canvasBuffer: Buffer,
  nameOverlay: NameOverlayConfig,
  outputWidth: number,
  outputHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fontBasePath: string,
): Promise<Buffer> {
  if (!nameOverlay.enabled) {
    return canvasBuffer;
  }

  const svg = buildNameOverlaySvg(
    outputWidth,
    outputHeight,
    nameOverlay.firstName,
    nameOverlay.lastName,
    nameOverlay.style,
  );

  if (!svg) {
    return canvasBuffer;
  }

  return sharp(canvasBuffer)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
