import sharp from 'sharp';

/**
 * Remove color fringing / halo around subject edges via morphological alpha erosion.
 *
 * Algorithm:
 *  1. Scan each pixel — if opaque but any neighbour within `radiusPx` is fully transparent,
 *     reduce that pixel's alpha to the minimum alpha found among those neighbours.
 *  2. This erodes the alpha channel by `radiusPx` pixels, shaving off the semi-transparent
 *     fringe ring that colour-matting tools leave behind.
 *
 * Operates purely on alpha; RGB channels are preserved unchanged.
 */
export async function defringeSubject(
  subjectBuffer: Buffer,
  radiusPx: number = 1,
): Promise<Buffer> {
  const { data, info } = await sharp(subjectBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const alphaChannel = channels - 1;
  const output = Buffer.from(data); // copy — we read from `data`, write to `output`

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels + alphaChannel;
      const alpha = data[idx] ?? 0;

      // Fully transparent pixels can't be eroded further
      if (alpha === 0) continue;

      let minNeighbour = alpha;

      outer: for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          // Treat out-of-bounds as fully transparent — shrinks border pixels
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            minNeighbour = 0;
            break outer;
          }
          const nAlpha = data[(ny * width + nx) * channels + alphaChannel] ?? 0;
          if (nAlpha < minNeighbour) {
            minNeighbour = nAlpha;
            if (minNeighbour === 0) break outer;
          }
        }
      }

      output[idx] = minNeighbour;
    }
  }

  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}
