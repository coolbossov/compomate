import sharp from 'sharp';
import { defringeSubject } from './defringe';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a small test image with:
 *  - Fully transparent border (1px)
 *  - Semi-transparent fringe ring (1px, alpha=128)
 *  - Fully opaque interior (alpha=255)
 */
async function createFringeTestImage(
  size: number = 20,
): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(size * size * channels, 0); // all transparent

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;

      // 1px border: fully transparent (already 0)
      if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
        continue;
      }

      // 1px fringe ring: semi-transparent (alpha=128)
      if (x === 1 || x === size - 2 || y === 1 || y === size - 2) {
        data[idx] = 200;     // R
        data[idx + 1] = 100; // G
        data[idx + 2] = 50;  // B
        data[idx + 3] = 128; // A — semi-transparent fringe
        continue;
      }

      // Interior: fully opaque
      data[idx] = 255;     // R
      data[idx + 1] = 0;   // G
      data[idx + 2] = 0;   // B
      data[idx + 3] = 255; // A — fully opaque
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('defringeSubject', () => {
  it('reduces alpha of fringe pixels adjacent to transparent pixels', async () => {
    const input = await createFringeTestImage(20);
    const result = await defringeSubject(input, 1);

    // Read raw pixel data from the result
    const { data, info } = await sharp(result)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Check a fringe pixel at (1,1) — it borders transparent pixels (0,0), (0,1), (1,0)
    // The defringe algorithm sets alpha = min neighbour alpha
    // Since (0,0) is transparent (alpha=0), the fringe pixel should be 0
    const fringeIdx = (1 * width + 1) * channels + 3;
    expect(data[fringeIdx]).toBe(0);
  });

  it('preserves fully opaque interior pixels', async () => {
    const input = await createFringeTestImage(20);
    const result = await defringeSubject(input, 1);

    const { data, info } = await sharp(result)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, channels } = info;

    // Interior pixel at (5, 5) — all neighbours are also opaque (alpha=255) or fringe (alpha=128)
    // Its minimum neighbour alpha is at least 128, but it's interior so min should still be 128+
    // Actually, a pixel at (5,5) is deep inside — all neighbours are opaque (255).
    // So the output alpha should remain 255.
    const interiorIdx = (5 * width + 5) * channels + 3;
    expect(data[interiorIdx]).toBe(255);
  });

  it('keeps fully transparent pixels unchanged', async () => {
    const input = await createFringeTestImage(20);
    const result = await defringeSubject(input, 1);

    const { data, info } = await sharp(result)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, channels } = info;

    // Corner pixel (0,0) is fully transparent — should remain 0
    const transparentIdx = (0 * width + 0) * channels + 3;
    expect(data[transparentIdx]).toBe(0);
  });

  it('output dimensions match input dimensions', async () => {
    const size = 30;
    const input = await createFringeTestImage(size);
    const result = await defringeSubject(input, 1);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
  });

  it('output is a valid PNG', async () => {
    const input = await createFringeTestImage(20);
    const result = await defringeSubject(input, 1);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
  });
});
