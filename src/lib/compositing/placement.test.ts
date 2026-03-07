import { calculatePlacement } from './placement';
import { INITIAL_COMPOSITION, type CompositionState } from '@/lib/shared/composition';

// Helper to make a composition with overrides
function makeComposition(overrides: Partial<CompositionState> = {}): CompositionState {
  return { ...INITIAL_COMPOSITION, ...overrides };
}

describe('calculatePlacement', () => {
  const canvasW = 4000;
  const canvasH = 5000;

  describe('centered subject (default position)', () => {
    it('places subject centered at 50% x, 84% y', () => {
      const subW = 2000;
      const subH = 3000;
      const comp = makeComposition({ xPct: 50, yPct: 84 });
      const result = calculatePlacement(subW, subH, canvasW, canvasH, comp);

      // footX = round(4000 * 0.50) = 2000
      // footY = round(5000 * 0.84) = 4200
      // left = round(2000 - 2000/2) = 1000
      // top = round(4200 - 3000) = 1200
      expect(result.left).toBe(1000);
      expect(result.top).toBe(1200);
      expect(result.width).toBe(subW);
      expect(result.height).toBe(subH);
    });
  });

  describe('far left edge (xPct = 0)', () => {
    it('places subject half off-canvas to the left', () => {
      const subW = 2000;
      const subH = 3000;
      const comp = makeComposition({ xPct: 0, yPct: 84 });
      const result = calculatePlacement(subW, subH, canvasW, canvasH, comp);

      // footX = round(4000 * 0) = 0
      // left = round(0 - 1000) = -1000
      expect(result.left).toBe(-1000);
    });
  });

  describe('far right edge (xPct = 100)', () => {
    it('places subject half off-canvas to the right', () => {
      const subW = 2000;
      const subH = 3000;
      const comp = makeComposition({ xPct: 100, yPct: 84 });
      const result = calculatePlacement(subW, subH, canvasW, canvasH, comp);

      // footX = round(4000 * 1.0) = 4000
      // left = round(4000 - 1000) = 3000
      expect(result.left).toBe(3000);
    });
  });

  describe('top of canvas (yPct = 0)', () => {
    it('places subject entirely above canvas', () => {
      const subW = 2000;
      const subH = 3000;
      const comp = makeComposition({ xPct: 50, yPct: 0 });
      const result = calculatePlacement(subW, subH, canvasW, canvasH, comp);

      // footY = round(5000 * 0) = 0
      // top = round(0 - 3000) = -3000
      expect(result.top).toBe(-3000);
    });
  });

  describe('bottom of canvas (yPct = 100)', () => {
    it('places subject with feet at the very bottom', () => {
      const subW = 2000;
      const subH = 3000;
      const comp = makeComposition({ xPct: 50, yPct: 100 });
      const result = calculatePlacement(subW, subH, canvasW, canvasH, comp);

      // footY = round(5000 * 1.0) = 5000
      // top = round(5000 - 3000) = 2000
      expect(result.top).toBe(2000);
    });
  });

  describe('various subject sizes', () => {
    it('handles small subject (500x800)', () => {
      const comp = makeComposition({ xPct: 50, yPct: 84 });
      const result = calculatePlacement(500, 800, canvasW, canvasH, comp);

      // footX = 2000, footY = 4200
      // left = round(2000 - 250) = 1750
      // top = round(4200 - 800) = 3400
      expect(result.left).toBe(1750);
      expect(result.top).toBe(3400);
      expect(result.width).toBe(500);
      expect(result.height).toBe(800);
    });

    it('handles medium subject (2000x3000)', () => {
      const comp = makeComposition({ xPct: 50, yPct: 84 });
      const result = calculatePlacement(2000, 3000, canvasW, canvasH, comp);

      expect(result.left).toBe(1000);
      expect(result.top).toBe(1200);
      expect(result.width).toBe(2000);
      expect(result.height).toBe(3000);
    });

    it('handles large subject (4000x5000)', () => {
      const comp = makeComposition({ xPct: 50, yPct: 84 });
      const result = calculatePlacement(4000, 5000, canvasW, canvasH, comp);

      // footX = 2000, footY = 4200
      // left = round(2000 - 2000) = 0
      // top = round(4200 - 5000) = -800
      expect(result.left).toBe(0);
      expect(result.top).toBe(-800);
      expect(result.width).toBe(4000);
      expect(result.height).toBe(5000);
    });
  });

  describe('width and height passthrough', () => {
    it('always returns input subject dimensions', () => {
      const comp = makeComposition();
      const result = calculatePlacement(1234, 5678, canvasW, canvasH, comp);
      expect(result.width).toBe(1234);
      expect(result.height).toBe(5678);
    });
  });

  describe('odd subject dimensions', () => {
    it('handles odd-width subject (rounding)', () => {
      const comp = makeComposition({ xPct: 50, yPct: 50 });
      const result = calculatePlacement(1001, 2000, canvasW, canvasH, comp);

      // footX = 2000, footY = 2500
      // left = round(2000 - 500.5) = round(1499.5) = 1500  (or 1499 depending on rounding)
      // top = round(2500 - 2000) = 500
      expect(result.left).toBe(Math.round(2000 - 1001 / 2));
      expect(result.top).toBe(500);
    });
  });
});
