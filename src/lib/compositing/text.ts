import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { FONT_PAIRS } from '@/lib/constants';
import {
  buildNameOverlaySvgFromConfig,
  measureNameOverlayTextMetrics,
  resolveNameOverlayFontFaces,
} from '@/lib/shared/name-overlay';
import type { NameOverlayConfig } from '@/types/composition';

const fontDataUrlCache = new Map<string, string>();

function fontPathToDataUrl(fontPath: string): string {
  const cached = fontDataUrlCache.get(fontPath);
  if (cached) {
    return cached;
  }

  const buffer = fs.readFileSync(fontPath);
  const extension = path.extname(fontPath).toLowerCase();
  const mimeType = extension === '.otf' ? 'font/otf' : 'font/ttf';
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  fontDataUrlCache.set(fontPath, dataUrl);
  return dataUrl;
}

/**
 * Render a name text overlay onto the composite canvas.
 *
 * The SVG layout is shared with the client preview, while the export path
 * resolves the selected TTF files from disk and embeds them into the SVG as
 * data URIs so Sharp renders the exact font pair selected in the UI.
 */
export async function renderNameOverlay(
  canvasBuffer: Buffer,
  nameOverlay: NameOverlayConfig,
  outputWidth: number,
  outputHeight: number,
  fontBasePath: string,
): Promise<Buffer> {
  if (!nameOverlay.enabled) {
    return canvasBuffer;
  }

  const fontFaces = resolveNameOverlayFontFaces(nameOverlay.fontPairId, (filename) =>
    fontPathToDataUrl(path.join(fontBasePath, filename)),
  );
  const fontPair =
    FONT_PAIRS.find((candidate) => candidate.id === nameOverlay.fontPairId) ??
    FONT_PAIRS[0];
  const firstFontPath = path.join(fontBasePath, fontPair.firstNameFont);
  const lastFontPath = path.join(fontBasePath, fontPair.lastNameFont);
  const fontFiles = [firstFontPath, lastFontPath];
  const textMetrics = measureNameOverlayTextMetrics(
    outputHeight,
    nameOverlay,
    {
      firstName: {
        key: firstFontPath,
        data: fs.readFileSync(firstFontPath),
      },
      lastName: {
        key: lastFontPath,
        data: fs.readFileSync(lastFontPath),
      },
    },
  );

  const svg = buildNameOverlaySvgFromConfig(
    outputWidth,
    outputHeight,
    nameOverlay,
    fontFaces,
    textMetrics,
  );

  if (!svg) {
    return canvasBuffer;
  }

  const overlayPng = new Resvg(svg, {
    fitTo: { mode: 'width', value: outputWidth },
    font: {
      fontFiles,
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng();

  return sharp(canvasBuffer)
    .composite([{ input: overlayPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
}
