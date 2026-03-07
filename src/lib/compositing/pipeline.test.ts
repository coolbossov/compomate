import sharp from 'sharp';
import path from 'node:path';
import { runCompositorPipeline } from './pipeline';
import { INITIAL_COMPOSITION, type CompositionState } from '@/lib/shared/composition';
import type { CompositorInput } from './types';
import type { NameOverlayConfig } from '@/types/composition';

// ── Helpers ────────────────────────────────────────────────────────────────

const OUTPUT_W = 400;
const OUTPUT_H = 500;
const FONT_BASE_PATH = path.join(process.cwd(), 'public', 'fonts');

async function createSubjectPng(
  width: number = 200,
  height: number = 300,
): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);

  // Make most of the image opaque (simulating a person cutout)
  const marginX = Math.round(width * 0.2);
  const marginTop = Math.round(height * 0.05);
  for (let y = marginTop; y < height; y++) {
    for (let x = marginX; x < width - marginX; x++) {
      const idx = (y * width + x) * channels;
      data[idx] = 180;     // R
      data[idx + 1] = 120; // G
      data[idx + 2] = 80;  // B
      data[idx + 3] = 255; // A
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function createBackdropPng(
  width: number = OUTPUT_W,
  height: number = OUTPUT_H,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 40, g: 50, b: 80, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
}

function makeInput(overrides: Partial<CompositorInput> = {}): Promise<CompositorInput> {
  return (async () => {
    const subjectBuffer = overrides.subjectBuffer ?? (await createSubjectPng());
    const backdropBuffer = overrides.backdropBuffer ?? (await createBackdropPng());
    return {
      subjectBuffer,
      backdropBuffer,
      composition: overrides.composition ?? { ...INITIAL_COMPOSITION },
      outputWidth: overrides.outputWidth ?? OUTPUT_W,
      outputHeight: overrides.outputHeight ?? OUTPUT_H,
      nameOverlay: overrides.nameOverlay,
      fontBasePath: overrides.fontBasePath ?? FONT_BASE_PATH,
    };
  })();
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runCompositorPipeline', () => {
  it('produces a PNG buffer at the correct output dimensions', async () => {
    const input = await makeInput();
    const output = await runCompositorPipeline(input);

    expect(output.buffer).toBeInstanceOf(Buffer);
    expect(output.width).toBe(OUTPUT_W);
    expect(output.height).toBe(OUTPUT_H);
    expect(output.format).toBe('png');

    const meta = await sharp(output.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);
    expect(meta.channels).toBe(4);
  });

  it('runs with all effects enabled', async () => {
    const composition: CompositionState = {
      ...INITIAL_COMPOSITION,
      reflectionEnabled: true,
      reflectionSizePct: 100,
      reflectionOpacityPct: 36,
      reflectionBlurPx: 2,
      legFadeEnabled: true,
      legFadeStartPct: 74,
      fogEnabled: true,
      fogOpacityPct: 30,
      fogHeightPct: 26,
      shadowEnabled: true,
      shadowStrengthPct: 40,
    };

    const input = await makeInput({ composition });
    const output = await runCompositorPipeline(input);

    expect(output.buffer).toBeInstanceOf(Buffer);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);
  });

  it('runs with all effects disabled', async () => {
    const composition: CompositionState = {
      ...INITIAL_COMPOSITION,
      reflectionEnabled: false,
      reflectionSizePct: 0,
      legFadeEnabled: false,
      fogEnabled: false,
      fogOpacityPct: 0,
      shadowEnabled: false,
      shadowStrengthPct: 0,
    };

    const input = await makeInput({ composition });
    const output = await runCompositorPipeline(input);

    expect(output.buffer).toBeInstanceOf(Buffer);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.width).toBe(OUTPUT_W);
    expect(meta.height).toBe(OUTPUT_H);
  });

  it('applies name overlay when enabled', async () => {
    const nameOverlay: NameOverlayConfig = {
      firstName: 'Test',
      lastName: 'Name',
      style: 'classic',
      fontPairId: 'classic',
      enabled: true,
      sizePct: 8,
      yFromBottomPct: 5,
    };

    const inputWithName = await makeInput({ nameOverlay });
    const inputWithoutName = await makeInput();

    const outputWithName = await runCompositorPipeline(inputWithName);
    const outputWithoutName = await runCompositorPipeline(inputWithoutName);

    // Both should be valid
    expect(outputWithName.buffer).toBeInstanceOf(Buffer);
    expect(outputWithoutName.buffer).toBeInstanceOf(Buffer);

    // They should differ because text was rendered onto one
    expect(outputWithName.buffer.equals(outputWithoutName.buffer)).toBe(false);
  });

  it('output has 4 channels (RGBA)', async () => {
    const input = await makeInput();
    const output = await runCompositorPipeline(input);

    const meta = await sharp(output.buffer).metadata();
    expect(meta.channels).toBe(4);
  });

  it('effects-on vs effects-off produce different output', async () => {
    const allOn: CompositionState = {
      ...INITIAL_COMPOSITION,
      reflectionEnabled: true,
      reflectionSizePct: 100,
      legFadeEnabled: true,
      fogEnabled: true,
      fogOpacityPct: 50,
    };

    const allOff: CompositionState = {
      ...INITIAL_COMPOSITION,
      reflectionEnabled: false,
      reflectionSizePct: 0,
      legFadeEnabled: false,
      fogEnabled: false,
      fogOpacityPct: 0,
    };

    const outputOn = await runCompositorPipeline(await makeInput({ composition: allOn }));
    const outputOff = await runCompositorPipeline(await makeInput({ composition: allOff }));

    expect(outputOn.buffer.equals(outputOff.buffer)).toBe(false);
  });
});
