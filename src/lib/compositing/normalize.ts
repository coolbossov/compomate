import sharp from 'sharp';
import { MAX_INPUT_PIXELS, MAX_INPUT_EDGE_PX } from '@/lib/constants';

/**
 * Normalize subject input: convert to premultiplied RGBA PNG, apply ICC sRGB,
 * reject oversized inputs. Auto-rotates based on EXIF orientation.
 */
export async function normalizeSubject(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error('Unable to read subject dimensions.');
  }
  if (
    width > MAX_INPUT_EDGE_PX ||
    height > MAX_INPUT_EDGE_PX ||
    width * height > MAX_INPUT_PIXELS
  ) {
    throw new Error('Subject dimensions exceed server image limits.');
  }

  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .ensureAlpha()
    .toColorspace('srgb')
    .png()
    .toBuffer();
}

/**
 * Normalize backdrop: resize to exact output dimensions (cover strategy),
 * convert to sRGB. Upscaling is intentional here — backdrop must fill canvas.
 */
export async function normalizeBackdrop(
  input: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error('Unable to read backdrop dimensions.');
  }
  if (
    width > MAX_INPUT_EDGE_PX ||
    height > MAX_INPUT_EDGE_PX ||
    width * height > MAX_INPUT_PIXELS
  ) {
    throw new Error('Backdrop dimensions exceed server image limits.');
  }

  // NOTE: withoutEnlargement intentionally omitted here — backdrop MUST fill the output
  // canvas at 4000×5000. AI-generated backdrops are typically 1024×1280 and need upscaling.
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .ensureAlpha()
    .resize({ width: targetWidth, height: targetHeight, fit: 'cover', position: 'centre' })
    .toColorspace('srgb')
    .png()
    .toBuffer();
}
