import {
  DEFAULT_FONT_PAIR,
  FONT_PAIRS,
  NAME_OVERLAY_DEFAULTS,
} from '@/lib/constants';
import type { FontPairId, NameOverlayConfig } from '@/types/composition';
import type { NameStyleId } from '@/lib/shared/composition';
import opentype from 'opentype.js/dist/opentype.module.js';

const LAST_NAME_LETTER_SPACING_EM = 0.12;

type FontBinary = ArrayBuffer | Uint8Array;

type OpenTypeFont = {
  getAdvanceWidth: (
    text: string,
    fontSize: number,
    options?: { kerning?: boolean },
  ) => number;
  getPath: (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options?: { kerning?: boolean },
  ) => {
    getBoundingBox: () => {
      x1: number;
      x2: number;
    };
  };
};

export interface NameOverlayFontFaces {
  firstNameFamily: string;
  lastNameFamily: string;
  firstNameSrc?: string;
  lastNameSrc?: string;
}

export interface NameOverlayFontMeasurementSource {
  key: string;
  data: FontBinary;
}

export interface NameOverlayTextRunMetrics {
  x1: number;
  x2: number;
  width: number;
}

export interface NameOverlayTextMetrics {
  firstName?: NameOverlayTextRunMetrics;
  lastName?: NameOverlayTextRunMetrics;
}

export interface BuildNameOverlaySvgOptions {
  firstName?: string;
  lastName?: string;
  style?: NameStyleId;
  fontPairId?: FontPairId;
  sizePct?: number;
  yFromBottomPct?: number;
  fontFaces?: NameOverlayFontFaces;
  textMetrics?: NameOverlayTextMetrics;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toArrayBuffer(data: FontBinary): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  const view = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
    ? data
    : data.slice();
  const copied = new Uint8Array(view.byteLength);
  copied.set(view);
  return copied.buffer;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

const parsedFontCache = new Map<string, OpenTypeFont>();

function resolveFontFamilyName(filename: string): string {
  if (filename.startsWith('GreatVibes')) return 'Great Vibes';
  if (filename.startsWith('DancingScript')) return 'Dancing Script';
  if (filename.startsWith('Oswald')) return 'Oswald';
  if (filename.startsWith('Montserrat')) return 'Montserrat';
  return stripExtension(filename);
}

function buildFontFaceCss(fontFaces: NameOverlayFontFaces): string {
  const rules: string[] = [];

  if (fontFaces.firstNameSrc) {
    rules.push(`
      @font-face {
        font-family: '${fontFaces.firstNameFamily}';
        src: url('${fontFaces.firstNameSrc}') format('truetype');
        font-display: swap;
      }
    `);
  }

  if (fontFaces.lastNameSrc) {
    rules.push(`
      @font-face {
        font-family: '${fontFaces.lastNameFamily}';
        src: url('${fontFaces.lastNameSrc}') format('truetype');
        font-display: swap;
      }
    `);
  }

  return rules.join('\n');
}

export function resolveNameOverlayFontFaces(
  fontPairId: FontPairId = DEFAULT_FONT_PAIR,
  resolveSrc?: (filename: string) => string,
): NameOverlayFontFaces {
  const pair = FONT_PAIRS.find((candidate) => candidate.id === fontPairId) ?? FONT_PAIRS[0];

  return {
    firstNameFamily: resolveFontFamilyName(pair.firstNameFont),
    lastNameFamily: resolveFontFamilyName(pair.lastNameFont),
    firstNameSrc: resolveSrc?.(pair.firstNameFont),
    lastNameSrc: resolveSrc?.(pair.lastNameFont),
  };
}

function getBaseSize(canvasHeight: number, sizePct: number): number {
  return Math.max(
    40,
    Math.round(canvasHeight * (sizePct / 100) * 0.38),
  );
}

function getRunSizes(style: NameStyleId, baseSize: number): {
  firstSize: number;
  lastSize: number;
} {
  return {
    firstSize: Math.max(44, Math.round(baseSize * (style === 'modern' ? 1 : 1.18))),
    lastSize: Math.max(36, Math.round(baseSize * (style === 'modern' ? 0.78 : 0.68))),
  };
}

function getGapPx(firstSize: number, lastSize: number): number {
  return Math.max(
    28,
    Math.round(Math.max(firstSize * 0.78, lastSize * 0.95)),
  );
}

function estimateTextRunMetrics(
  text: string,
  fontSize: number,
  role: 'first' | 'last',
  letterSpacingEm = 0,
): NameOverlayTextRunMetrics {
  const characters = [...text].length;
  const tracking = Math.max(0, characters - 1) * fontSize * letterSpacingEm;
  const widthFactor = role === 'first' ? 0.82 : 0.68;
  const x1 = role === 'first' ? -fontSize * 0.22 : 0;
  const width = Math.max(fontSize * 0.7, characters * fontSize * widthFactor + tracking);
  return { x1, x2: x1 + width, width };
}

function loadParsedFont(
  source: NameOverlayFontMeasurementSource | undefined,
): OpenTypeFont | null {
  if (!source) {
    return null;
  }

  const cached = parsedFontCache.get(source.key);
  if (cached) {
    return cached;
  }

  const parsed = opentype.parse(toArrayBuffer(source.data)) as OpenTypeFont;
  parsedFontCache.set(source.key, parsed);
  return parsed;
}

function measureTextRun(
  text: string,
  fontSize: number,
  source: NameOverlayFontMeasurementSource | undefined,
  role: 'first' | 'last',
  letterSpacingEm = 0,
): NameOverlayTextRunMetrics {
  const font = loadParsedFont(source);
  if (!font) {
    return estimateTextRunMetrics(text, fontSize, role, letterSpacingEm);
  }

  try {
    const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
    const bounds = path.getBoundingBox();
    const advanceWidth = font.getAdvanceWidth(text, fontSize, { kerning: true });
    const tracking = Math.max(0, [...text].length - 1) * fontSize * letterSpacingEm;
    const x1 = Number.isFinite(bounds.x1) ? bounds.x1 : 0;
    const rawRight = Number.isFinite(bounds.x2) ? bounds.x2 : advanceWidth;
    const width = Math.max(advanceWidth, rawRight - x1) + tracking;
    return {
      x1,
      x2: x1 + width,
      width,
    };
  } catch {
    return estimateTextRunMetrics(text, fontSize, role, letterSpacingEm);
  }
}

export function measureNameOverlayTextMetrics(
  canvasHeight: number,
  options: Pick<BuildNameOverlaySvgOptions, 'firstName' | 'lastName' | 'style' | 'sizePct'>,
  fontSources?: {
    firstName?: NameOverlayFontMeasurementSource;
    lastName?: NameOverlayFontMeasurementSource;
  },
): NameOverlayTextMetrics {
  const first = (options.firstName ?? '').trim();
  const last = (options.lastName ?? '').trim().toUpperCase();
  const style = options.style ?? 'classic';
  const sizePct = clamp(
    options.sizePct ?? NAME_OVERLAY_DEFAULTS.sizePct,
    2,
    20,
  );
  const baseSize = getBaseSize(canvasHeight, sizePct);
  const { firstSize, lastSize } = getRunSizes(style, baseSize);

  return {
    firstName: first
      ? measureTextRun(first, firstSize, fontSources?.firstName, 'first')
      : undefined,
    lastName: last
      ? measureTextRun(
          last,
          lastSize,
          fontSources?.lastName,
          'last',
          LAST_NAME_LETTER_SPACING_EM,
        )
      : undefined,
  };
}

function buildTextMarkup(
  first: string,
  last: string,
  canvasWidth: number,
  baselineY: number,
  style: NameStyleId,
  baseSize: number,
  fontFaces: NameOverlayFontFaces,
  textMetrics?: NameOverlayTextMetrics,
): string {
  const safeFirst = escapeXml(first);
  const safeLast = escapeXml(last.toUpperCase());
  const { firstSize, lastSize } = getRunSizes(style, baseSize);
  const firstFill =
    style === 'outline' ? 'rgba(255,255,255,0.10)' :
    style === 'modern' ? 'url(#name-grad)' :
    '#ffffff';
  const lastFill =
    style === 'outline' ? 'rgba(201,190,255,0.14)' :
    style === 'modern' ? 'url(#name-grad)' :
    '#c9beff';
  const firstStroke =
    style === 'outline' ? 'stroke="#ffffff" stroke-width="2.4" paint-order="stroke fill"' :
    '';
  const lastStroke =
    style === 'outline' ? 'stroke="#ffffff" stroke-width="1.8" paint-order="stroke fill"' :
    '';
  const filter = style === 'outline' ? '' : 'filter="url(#name-shadow)"';
  const centerX = canvasWidth / 2;
  const firstMetrics =
    first
      ? textMetrics?.firstName ?? estimateTextRunMetrics(first, firstSize, 'first')
      : undefined;
  const lastMetrics =
    last
      ? textMetrics?.lastName ??
        estimateTextRunMetrics(last.toUpperCase(), lastSize, 'last', LAST_NAME_LETTER_SPACING_EM)
      : undefined;
  const gap = getGapPx(firstSize, lastSize);

  let firstX = centerX;
  let lastX = centerX;
  let firstAnchor = 'middle';
  let lastAnchor = 'middle';

  if (firstMetrics && lastMetrics) {
    const totalWidth = firstMetrics.width + gap + lastMetrics.width;
    const visualStartX = centerX - totalWidth / 2;
    firstX = visualStartX - firstMetrics.x1;
    lastX = visualStartX + firstMetrics.width + gap - lastMetrics.x1;
    firstAnchor = 'start';
    lastAnchor = 'start';
  } else if (firstMetrics) {
    firstX = centerX - (firstMetrics.x1 + firstMetrics.x2) / 2;
    firstAnchor = 'start';
  } else if (lastMetrics) {
    lastX = centerX - (lastMetrics.x1 + lastMetrics.x2) / 2;
    lastAnchor = 'start';
  }

  return `
    ${first ? `
      <text x="${firstX}" y="${baselineY}" text-anchor="${firstAnchor}" dominant-baseline="alphabetic" font-family="${fontFaces.firstNameFamily}" font-size="${firstSize}" fill="${firstFill}" ${firstStroke} ${filter}>
        ${safeFirst}
      </text>
    ` : ''}
    ${last ? `
      <text x="${lastX}" y="${baselineY}" text-anchor="${lastAnchor}" dominant-baseline="alphabetic" font-family="${fontFaces.lastNameFamily}" font-size="${lastSize}" font-weight="700" letter-spacing="0.12em" fill="${lastFill}" ${lastStroke} ${filter}>
        ${safeLast}
      </text>
    ` : ''}
  `;
}

export function buildNameOverlaySvg(
  canvasWidth: number,
  canvasHeight: number,
  options: BuildNameOverlaySvgOptions,
): string | null {
  const first = (options.firstName ?? '').trim();
  const last = (options.lastName ?? '').trim();
  if (!first && !last) {
    return null;
  }

  const style = options.style ?? 'classic';
  const sizePct = clamp(
    options.sizePct ?? NAME_OVERLAY_DEFAULTS.sizePct,
    2,
    20,
  );
  const yFromBottomPct = clamp(
    options.yFromBottomPct ?? NAME_OVERLAY_DEFAULTS.yFromBottomPct,
    1,
    25,
  );
  const fontFaces =
    options.fontFaces ??
    resolveNameOverlayFontFaces(options.fontPairId ?? DEFAULT_FONT_PAIR);

  const baselineY =
    canvasHeight - Math.max(34, Math.round(canvasHeight * (yFromBottomPct / 100)));
  const baseSize = getBaseSize(canvasHeight, sizePct);
  const fontFaceCss = buildFontFaceCss(fontFaces);

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style><![CDATA[
          ${fontFaceCss}
        ]]></style>
        <filter id="name-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.75"/>
        </filter>
        <linearGradient id="name-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f8fbff" />
          <stop offset="100%" stop-color="#dce6ff" />
        </linearGradient>
      </defs>
      ${buildTextMarkup(
        first,
        last,
        canvasWidth,
        baselineY,
        style,
        baseSize,
        fontFaces,
        options.textMetrics,
      )}
    </svg>
  `;
}

export function buildNameOverlaySvgFromConfig(
  canvasWidth: number,
  canvasHeight: number,
  config: Pick<
    NameOverlayConfig,
    'firstName' | 'lastName' | 'style' | 'fontPairId' | 'sizePct' | 'yFromBottomPct'
  >,
  fontFaces?: NameOverlayFontFaces,
  textMetrics?: NameOverlayTextMetrics,
): string | null {
  return buildNameOverlaySvg(canvasWidth, canvasHeight, {
    firstName: config.firstName,
    lastName: config.lastName,
    style: config.style,
    fontPairId: config.fontPairId,
    sizePct: config.sizePct,
    yFromBottomPct: config.yFromBottomPct,
    fontFaces,
    textMetrics,
  });
}
