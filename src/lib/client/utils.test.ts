import { describe, expect, it } from 'vitest';

import { fitWithinMaxDimension } from './utils';

describe('fitWithinMaxDimension', () => {
  it('reduces a portrait logo to the overlay limit without changing its aspect ratio', () => {
    expect(fitWithinMaxDimension(991, 1324, 1024)).toEqual({ width: 766, height: 1024 });
  });

  it('does not enlarge an already bounded logo', () => {
    expect(fitWithinMaxDimension(400, 300, 1024)).toEqual({ width: 400, height: 300 });
  });
});
