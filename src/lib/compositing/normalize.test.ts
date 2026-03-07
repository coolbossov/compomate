import sharp from 'sharp';
import { normalizeSubject, normalizeBackdrop } from './normalize';

// ── Helpers ────────────────────────────────────────────────────────────────

async function createTestPng(
  width: number,
  height: number,
  channels: 3 | 4 = 4,
): Promise<Buffer> {
  const background =
    channels === 4
      ? { r: 255, g: 0, b: 0, alpha: 255 }
      : { r: 255, g: 0, b: 0 };

  return sharp({
    create: { width, height, channels, background },
  })
    .png()
    .toBuffer();
}

// ── normalizeSubject ───────────────────────────────────────────────────────

describe('normalizeSubject', () => {
  it('returns a valid RGBA PNG from an RGBA input', async () => {
    const input = await createTestPng(200, 300, 4);
    const result = await normalizeSubject(input);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.channels).toBe(4);
    expect(meta.space).toBe('srgb');
  });

  it('adds alpha channel to RGB-only input', async () => {
    const input = await createTestPng(100, 100, 3);
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.channels).toBe(3);

    const result = await normalizeSubject(input);
    const meta = await sharp(result).metadata();

    expect(meta.channels).toBe(4);
    expect(meta.format).toBe('png');
  });

  it('outputs sRGB colorspace', async () => {
    const input = await createTestPng(80, 80, 4);
    const result = await normalizeSubject(input);
    const meta = await sharp(result).metadata();

    expect(meta.space).toBe('srgb');
  });

  it('rejects an oversized image exceeding MAX_INPUT_EDGE_PX', async () => {
    // MAX_INPUT_EDGE_PX = 12000, so 13000 should throw
    const input = await createTestPng(13000, 100, 4);
    await expect(normalizeSubject(input)).rejects.toThrow(
      'Subject dimensions exceed server image limits.',
    );
  });

  it('handles very small images (10x10)', async () => {
    const input = await createTestPng(10, 10, 4);
    const result = await normalizeSubject(input);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
    expect(meta.channels).toBe(4);
  });

  it('preserves approximate dimensions', async () => {
    const input = await createTestPng(500, 800, 4);
    const result = await normalizeSubject(input);
    const meta = await sharp(result).metadata();

    expect(meta.width).toBe(500);
    expect(meta.height).toBe(800);
  });
});

// ── normalizeBackdrop ──────────────────────────────────────────────────────

describe('normalizeBackdrop', () => {
  it('returns a buffer at exact output dimensions', async () => {
    const input = await createTestPng(600, 800, 4);
    const result = await normalizeBackdrop(input, 400, 500);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(500);
    expect(meta.format).toBe('png');
    expect(meta.channels).toBe(4);
  });

  it('uses cover fit — output dimensions match exactly even with different aspect ratio', async () => {
    // 100x100 square → 400x500 (different aspect)
    const input = await createTestPng(100, 100, 4);
    const result = await normalizeBackdrop(input, 400, 500);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(500);
  });

  it('upscales small input to output dimensions', async () => {
    const input = await createTestPng(50, 50, 4);
    const result = await normalizeBackdrop(input, 400, 500);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(500);
  });

  it('outputs sRGB colorspace', async () => {
    const input = await createTestPng(200, 300, 4);
    const result = await normalizeBackdrop(input, 400, 500);
    const meta = await sharp(result).metadata();

    expect(meta.space).toBe('srgb');
  });

  it('rejects oversized backdrop', async () => {
    const input = await createTestPng(13000, 100, 4);
    await expect(normalizeBackdrop(input, 400, 500)).rejects.toThrow(
      'Backdrop dimensions exceed server image limits.',
    );
  });
});
