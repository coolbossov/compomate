import sharp from 'sharp';
import { applyLightWrap } from './lightwrap';
import type { PlacementResult } from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

const OUTPUT_W = 200;
const OUTPUT_H = 250;
const SUBJ_W = 80;
const SUBJ_H = 120;

/**
 * Create a subject with a transparent border and opaque interior,
 * simulating a real cutout photo. The light wrap algorithm only affects
 * pixels at the edge of transparency (dilated alpha - original alpha > 0).
 */
async function createCutoutSubject(
  width: number = SUBJ_W,
  height: number = SUBJ_H,
): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0); // all transparent

  // Opaque interior with a transparent border (LIGHT_WRAP_RADIUS_PX + margin)
  const margin = 12; // enough for the 8px light wrap radius to find edges
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const idx = (y * width + x) * channels;
      data[idx] = 255;     // R
      data[idx + 1] = 0;   // G
      data[idx + 2] = 0;   // B
      data[idx + 3] = 255; // A
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Create a solid-color backdrop (bright blue).
 */
async function createBackdrop(
  width: number = OUTPUT_W,
  height: number = OUTPUT_H,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 255, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
}

function makeCenteredPlacement(): PlacementResult {
  return {
    left: Math.round((OUTPUT_W - SUBJ_W) / 2),
    top: Math.round((OUTPUT_H - SUBJ_H) / 2),
    width: SUBJ_W,
    height: SUBJ_H,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('applyLightWrap', () => {
  it('produces output with same dimensions as input subject', async () => {
    const subject = await createCutoutSubject();
    const backdrop = await createBackdrop();
    const placement = makeCenteredPlacement();

    const result = await applyLightWrap(subject, backdrop, placement, OUTPUT_W, OUTPUT_H);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(SUBJ_W);
    expect(meta.height).toBe(SUBJ_H);
  });

  it('output is RGBA PNG', async () => {
    const subject = await createCutoutSubject();
    const backdrop = await createBackdrop();
    const placement = makeCenteredPlacement();

    const result = await applyLightWrap(subject, backdrop, placement, OUTPUT_W, OUTPUT_H);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.channels).toBe(4);
  });

  it('modifies edge pixels from backdrop color bleed', async () => {
    const subject = await createCutoutSubject();
    const backdrop = await createBackdrop();
    const placement = makeCenteredPlacement();

    const result = await applyLightWrap(subject, backdrop, placement, OUTPUT_W, OUTPUT_H);

    // The result should differ from the original subject
    // because light wrap composites backdrop-colored pixels on the edges
    expect(result.equals(subject)).toBe(false);
  });

  it('handles subject at edge of canvas (partially off-screen)', async () => {
    const subject = await createCutoutSubject();
    const backdrop = await createBackdrop();
    // Place subject so it partially overflows the canvas
    const edgePlacement: PlacementResult = {
      left: OUTPUT_W - Math.round(SUBJ_W / 2), // right half off-screen
      top: 10,
      width: SUBJ_W,
      height: SUBJ_H,
    };

    const result = await applyLightWrap(subject, backdrop, edgePlacement, OUTPUT_W, OUTPUT_H);

    // Should not throw and should return a valid buffer
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(SUBJ_W);
    expect(meta.height).toBe(SUBJ_H);
    expect(meta.format).toBe('png');
  });

  it('result is a valid buffer (not empty)', async () => {
    const subject = await createCutoutSubject();
    const backdrop = await createBackdrop();
    const placement = makeCenteredPlacement();

    const result = await applyLightWrap(subject, backdrop, placement, OUTPUT_W, OUTPUT_H);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
