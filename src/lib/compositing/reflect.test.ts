import sharp from 'sharp';
import { createReflection } from './reflect';
import { INITIAL_COMPOSITION, type CompositionState } from '@/lib/shared/composition';
import type { PlacementResult } from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

const OUTPUT_W = 400;
const OUTPUT_H = 500;

/**
 * Create a subject with opaque bottom half (simulating feet at bottom)
 * and transparent top half.
 */
async function createSubjectWithFeet(
  width: number = 100,
  height: number = 200,
): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);

  // Bottom half is opaque red
  const midpoint = Math.floor(height / 2);
  for (let y = midpoint; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      data[idx] = 255;     // R
      data[idx + 1] = 0;   // G
      data[idx + 2] = 0;   // B
      data[idx + 3] = 255; // A
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

function makePlacement(
  subjW: number = 100,
  subjH: number = 200,
): PlacementResult {
  // Center the subject, feet at y ~84% of canvas
  const footX = Math.round(OUTPUT_W * 0.5);
  const footY = Math.round(OUTPUT_H * 0.84);
  return {
    left: Math.round(footX - subjW / 2),
    top: Math.round(footY - subjH),
    width: subjW,
    height: subjH,
  };
}

function makeComposition(overrides: Partial<CompositionState> = {}): CompositionState {
  return { ...INITIAL_COMPOSITION, ...overrides };
}

/** Count non-zero alpha pixels in raw RGBA data */
function countNonTransparentPixels(data: Buffer, channels: number): number {
  let count = 0;
  for (let i = 3; i < data.length; i += channels) {
    if ((data[i] ?? 0) > 0) count++;
  }
  return count;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createReflection', () => {
  it('returns a full canvas-sized RGBA buffer', async () => {
    const subject = await createSubjectWithFeet();
    const comp = makeComposition();
    const placement = makePlacement();

    const result = await createReflection(subject, comp, OUTPUT_W, OUTPUT_H, placement);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);
    expect(meta.channels).toBe(4);
    expect(meta.format).toBe('png');
  });

  it('contains semi-transparent pixels (reflection is not fully opaque)', async () => {
    const subject = await createSubjectWithFeet();
    const comp = makeComposition({ reflectionOpacityPct: 50 });
    const placement = makePlacement();

    const result = await createReflection(subject, comp, OUTPUT_W, OUTPUT_H, placement);
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Check that there are pixels with alpha between 1 and 254 (semi-transparent)
    let hasSemiTransparent = false;
    for (let i = 3; i < data.length; i += info.channels) {
      const a = data[i] ?? 0;
      if (a > 0 && a < 255) {
        hasSemiTransparent = true;
        break;
      }
    }
    expect(hasSemiTransparent).toBe(true);
  });

  it('returns transparent buffer when reflectionEnabled=false', async () => {
    const subject = await createSubjectWithFeet();
    const comp = makeComposition({ reflectionEnabled: false });
    const placement = makePlacement();

    const result = await createReflection(subject, comp, OUTPUT_W, OUTPUT_H, placement);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);

    // All pixels should be transparent
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const nonTransparent = countNonTransparentPixels(data, info.channels);
    expect(nonTransparent).toBe(0);
  });

  it('returns transparent buffer when reflectionSizePct=0', async () => {
    const subject = await createSubjectWithFeet();
    const comp = makeComposition({ reflectionEnabled: true, reflectionSizePct: 0 });
    const placement = makePlacement();

    const result = await createReflection(subject, comp, OUTPUT_W, OUTPUT_H, placement);

    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const nonTransparent = countNonTransparentPixels(data, info.channels);
    expect(nonTransparent).toBe(0);
  });

  it('produces different outputs for different reflectionBlurPx values', async () => {
    const subject = await createSubjectWithFeet();
    const placement = makePlacement();

    const resultBlur0 = await createReflection(
      subject,
      makeComposition({ reflectionBlurPx: 0.5 }),
      OUTPUT_W,
      OUTPUT_H,
      placement,
    );
    const resultBlur10 = await createReflection(
      subject,
      makeComposition({ reflectionBlurPx: 10 }),
      OUTPUT_W,
      OUTPUT_H,
      placement,
    );
    const resultBlur20 = await createReflection(
      subject,
      makeComposition({ reflectionBlurPx: 20 }),
      OUTPUT_W,
      OUTPUT_H,
      placement,
    );

    // All three should differ from each other
    expect(resultBlur0.equals(resultBlur10)).toBe(false);
    expect(resultBlur10.equals(resultBlur20)).toBe(false);
  });

  it('reflectionOpacityPct=0 produces fully transparent output', async () => {
    const subject = await createSubjectWithFeet();
    const comp = makeComposition({ reflectionOpacityPct: 0 });
    const placement = makePlacement();

    const result = await createReflection(subject, comp, OUTPUT_W, OUTPUT_H, placement);

    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const nonTransparent = countNonTransparentPixels(data, info.channels);
    expect(nonTransparent).toBe(0);
  });

  it('reflectionOpacityPct=100 produces brighter reflection than 36', async () => {
    const subject = await createSubjectWithFeet();
    const placement = makePlacement();

    const result100 = await createReflection(
      subject,
      makeComposition({ reflectionOpacityPct: 100 }),
      OUTPUT_W,
      OUTPUT_H,
      placement,
    );
    const result36 = await createReflection(
      subject,
      makeComposition({ reflectionOpacityPct: 36 }),
      OUTPUT_W,
      OUTPUT_H,
      placement,
    );

    // Sum alpha values — higher opacity should have higher total alpha
    const raw100 = await sharp(result100).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const raw36 = await sharp(result36).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let sum100 = 0;
    let sum36 = 0;
    for (let i = 3; i < raw100.data.length; i += raw100.info.channels) {
      sum100 += raw100.data[i] ?? 0;
    }
    for (let i = 3; i < raw36.data.length; i += raw36.info.channels) {
      sum36 += raw36.data[i] ?? 0;
    }

    expect(sum100).toBeGreaterThan(sum36);
  });
});
