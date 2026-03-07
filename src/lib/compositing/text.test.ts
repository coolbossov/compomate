import sharp from 'sharp';
import path from 'node:path';
import { renderNameOverlay } from './text';
import type { NameOverlayConfig } from '@/types/composition';

// ── Helpers ────────────────────────────────────────────────────────────────

const OUTPUT_W = 800;
const OUTPUT_H = 1000;
const FONT_BASE_PATH = path.join(process.cwd(), 'public', 'fonts');

async function createCanvasBuffer(
  width: number = OUTPUT_W,
  height: number = OUTPUT_H,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 30, b: 40, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
}

function makeNameOverlay(overrides: Partial<NameOverlayConfig> = {}): NameOverlayConfig {
  return {
    firstName: 'John',
    lastName: 'Doe',
    style: 'classic',
    fontPairId: 'classic',
    enabled: true,
    sizePct: 8,
    yFromBottomPct: 5,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('renderNameOverlay', () => {
  it('composites text onto the canvas (output differs from input)', async () => {
    const canvas = await createCanvasBuffer();
    const overlay = makeNameOverlay();

    const result = await renderNameOverlay(canvas, overlay, OUTPUT_W, OUTPUT_H, FONT_BASE_PATH);

    expect(result).toBeInstanceOf(Buffer);
    // The result should differ from the input — text was composited
    expect(result.equals(canvas)).toBe(false);
  });

  it('output dimensions match input', async () => {
    const canvas = await createCanvasBuffer();
    const overlay = makeNameOverlay();

    const result = await renderNameOverlay(canvas, overlay, OUTPUT_W, OUTPUT_H, FONT_BASE_PATH);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);
    expect(meta.format).toBe('png');
  });

  it('returns input unchanged when enabled=false', async () => {
    const canvas = await createCanvasBuffer();
    const overlay = makeNameOverlay({ enabled: false });

    const result = await renderNameOverlay(canvas, overlay, OUTPUT_W, OUTPUT_H, FONT_BASE_PATH);

    expect(result.equals(canvas)).toBe(true);
  });

  it('returns input unchanged when both names are empty', async () => {
    const canvas = await createCanvasBuffer();
    const overlay = makeNameOverlay({ firstName: '', lastName: '' });

    const result = await renderNameOverlay(canvas, overlay, OUTPUT_W, OUTPUT_H, FONT_BASE_PATH);

    // buildNameOverlaySvg returns null when both names are empty → canvasBuffer returned
    expect(result.equals(canvas)).toBe(true);
  });

  it('produces different output for different font pairs', async () => {
    const canvas = await createCanvasBuffer();

    const resultClassic = await renderNameOverlay(
      canvas,
      makeNameOverlay({ fontPairId: 'classic' }),
      OUTPUT_W,
      OUTPUT_H,
      FONT_BASE_PATH,
    );

    const resultModern = await renderNameOverlay(
      canvas,
      makeNameOverlay({ fontPairId: 'modern' }),
      OUTPUT_W,
      OUTPUT_H,
      FONT_BASE_PATH,
    );

    expect(resultClassic.equals(resultModern)).toBe(false);
  });

  it('produces different output for different sizePct values', async () => {
    const canvas = await createCanvasBuffer();

    const resultSmall = await renderNameOverlay(
      canvas,
      makeNameOverlay({ sizePct: 4 }),
      OUTPUT_W,
      OUTPUT_H,
      FONT_BASE_PATH,
    );

    const resultLarge = await renderNameOverlay(
      canvas,
      makeNameOverlay({ sizePct: 14 }),
      OUTPUT_W,
      OUTPUT_H,
      FONT_BASE_PATH,
    );

    expect(resultSmall.equals(resultLarge)).toBe(false);
  });
});
