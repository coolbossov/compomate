import {
  clamp,
  wrapDegrees,
  getExportProfile,
  estimateShadowPreviewMetrics,
  INITIAL_COMPOSITION,
  EXPORT_PROFILES,
  type CompositionState,
  type ExportProfileId,
} from './composition';

// ── clamp ───────────────────────────────────────────────────
describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min when value is below', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('handles zero-width range', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(1, 3, 3)).toBe(3);
  });
});

// ── wrapDegrees ─────────────────────────────────────────────
describe('wrapDegrees', () => {
  it('returns 0 for 0', () => {
    expect(wrapDegrees(0)).toBe(0);
  });

  it('returns 0 for 360', () => {
    expect(wrapDegrees(360)).toBe(0);
  });

  it('wraps negative values', () => {
    expect(wrapDegrees(-90)).toBe(270);
    expect(wrapDegrees(-1)).toBe(359);
    // -360 % 360 === -0 in JS; -0 < 0 is false, so wrapDegrees returns -0
    // Use toEqual since Object.is(-0, 0) is false but -0 == 0 is true
    expect(wrapDegrees(-360) + 0).toBe(0);
  });

  it('wraps values over 360', () => {
    expect(wrapDegrees(450)).toBe(90);
    expect(wrapDegrees(720)).toBe(0);
    expect(wrapDegrees(361)).toBe(1);
  });

  it('returns value as-is when 0 < value < 360', () => {
    expect(wrapDegrees(180)).toBe(180);
    expect(wrapDegrees(359)).toBe(359);
    expect(wrapDegrees(1)).toBe(1);
  });
});

// ── getExportProfile ────────────────────────────────────────
describe('getExportProfile', () => {
  const profileIds: ExportProfileId[] = ['original', '8x10', '5x7', '4x5', '1x1'];

  it.each(profileIds)('returns the correct profile for "%s"', (id) => {
    const profile = getExportProfile(id);
    expect(profile).toBeDefined();
    expect(profile.id).toBe(id);
    expect(profile.label).toBeTruthy();
    expect(profile.description).toBeTruthy();
  });

  it('returns the original profile with null dimensions', () => {
    const p = getExportProfile('original');
    expect(p.widthIn).toBeNull();
    expect(p.heightIn).toBeNull();
    expect(p.widthPx).toBeNull();
    expect(p.heightPx).toBeNull();
    expect(p.aspectRatio).toBeNull();
  });

  it('returns 8x10 with correct dimensions', () => {
    const p = getExportProfile('8x10');
    expect(p.widthIn).toBe(8);
    expect(p.heightIn).toBe(10);
    expect(p.widthPx).toBe(2400);
    expect(p.heightPx).toBe(3000);
    expect(p.aspectRatio).toBeCloseTo(0.8, 5);
  });

  it('returns 5x7 with correct aspect ratio', () => {
    const p = getExportProfile('5x7');
    expect(p.aspectRatio).toBeCloseTo(5 / 7, 5);
  });

  it('returns 1x1 with square aspect ratio', () => {
    const p = getExportProfile('1x1');
    expect(p.aspectRatio).toBe(1);
    expect(p.widthPx).toBe(2400);
    expect(p.heightPx).toBe(2400);
  });

  it('returns undefined for invalid id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = getExportProfile('invalid' as any);
    expect(p).toBeUndefined();
  });
});

// ── INITIAL_COMPOSITION ─────────────────────────────────────
describe('INITIAL_COMPOSITION', () => {
  it('has expected default position', () => {
    expect(INITIAL_COMPOSITION.xPct).toBe(50);
    expect(INITIAL_COMPOSITION.yPct).toBe(84);
  });

  it('has expected subject height', () => {
    expect(INITIAL_COMPOSITION.subjectHeightPct).toBe(64);
  });

  it('has shadow enabled by default', () => {
    expect(INITIAL_COMPOSITION.shadowEnabled).toBe(true);
  });

  it('has reflection enabled by default', () => {
    expect(INITIAL_COMPOSITION.reflectionEnabled).toBe(true);
  });

  it('has fog disabled by default', () => {
    expect(INITIAL_COMPOSITION.fogEnabled).toBe(false);
  });

  it('has legFade disabled by default', () => {
    expect(INITIAL_COMPOSITION.legFadeEnabled).toBe(false);
  });

  it('has all expected keys', () => {
    const keys: (keyof CompositionState)[] = [
      'xPct', 'yPct', 'subjectHeightPct',
      'reflectionEnabled', 'reflectionSizePct', 'reflectionPositionPct',
      'reflectionOpacityPct', 'reflectionBlurPx',
      'legFadeEnabled', 'legFadeStartPct',
      'fogEnabled', 'fogOpacityPct', 'fogHeightPct',
      'shadowEnabled', 'shadowStrengthPct', 'lightDirectionDeg',
      'lightElevationDeg', 'shadowStretchPct', 'shadowBlurPx',
    ];
    for (const key of keys) {
      expect(INITIAL_COMPOSITION).toHaveProperty(key);
    }
  });
});

// ── EXPORT_PROFILES ─────────────────────────────────────────
describe('EXPORT_PROFILES', () => {
  it('has all 5 profiles', () => {
    expect(Object.keys(EXPORT_PROFILES)).toHaveLength(5);
    expect(EXPORT_PROFILES).toHaveProperty('original');
    expect(EXPORT_PROFILES).toHaveProperty('8x10');
    expect(EXPORT_PROFILES).toHaveProperty('5x7');
    expect(EXPORT_PROFILES).toHaveProperty('4x5');
    expect(EXPORT_PROFILES).toHaveProperty('1x1');
  });

  it('each profile has required fields', () => {
    for (const profile of Object.values(EXPORT_PROFILES)) {
      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('label');
      expect(profile).toHaveProperty('description');
      expect(typeof profile.label).toBe('string');
      expect(typeof profile.description).toBe('string');
    }
  });
});

// ── estimateShadowPreviewMetrics ────────────────────────────
describe('estimateShadowPreviewMetrics', () => {
  it('returns all expected fields with INITIAL_COMPOSITION', () => {
    const m = estimateShadowPreviewMetrics(INITIAL_COMPOSITION);
    expect(m).toHaveProperty('shadowAngleDeg');
    expect(m).toHaveProperty('shadowWidthPct');
    expect(m).toHaveProperty('shadowHeightPct');
    expect(m).toHaveProperty('shadowOffsetXPct');
    expect(m).toHaveProperty('shadowOffsetYPct');
    expect(m).toHaveProperty('shadowOpacity');
    expect(m).toHaveProperty('shadowBlurPx');
  });

  it('computes shadowAngleDeg as lightDirection + 180 (wrapped)', () => {
    const comp = { ...INITIAL_COMPOSITION, lightDirectionDeg: 0 };
    const m = estimateShadowPreviewMetrics(comp);
    // 0 + 180 + 0*12 = 180, wrapped = 180
    expect(m.shadowAngleDeg).toBe(180);
  });

  it('wraps shadowAngleDeg correctly for large lightDirection', () => {
    const comp = { ...INITIAL_COMPOSITION, lightDirectionDeg: 270 };
    const m = estimateShadowPreviewMetrics(comp);
    // 270 + 180 + 0 = 450, wrapped = 90
    expect(m.shadowAngleDeg).toBe(90);
  });

  it('includes lean factor in angle calculation', () => {
    const comp = { ...INITIAL_COMPOSITION, lightDirectionDeg: 0 };
    const m = estimateShadowPreviewMetrics(comp, 34, 5);
    // 0 + 180 + 5*12 = 240, wrapped = 240
    expect(m.shadowAngleDeg).toBe(240);
  });

  it('clamps shadowOpacity to [0, 1]', () => {
    const compLow = { ...INITIAL_COMPOSITION, shadowStrengthPct: 0 };
    expect(estimateShadowPreviewMetrics(compLow).shadowOpacity).toBe(0);

    const compHigh = { ...INITIAL_COMPOSITION, shadowStrengthPct: 150 };
    expect(estimateShadowPreviewMetrics(compHigh).shadowOpacity).toBe(1);

    const compMid = { ...INITIAL_COMPOSITION, shadowStrengthPct: 50 };
    expect(estimateShadowPreviewMetrics(compMid).shadowOpacity).toBeCloseTo(0.5, 5);
  });

  it('clamps shadowBlurPx to [0, 40]', () => {
    const compLow = { ...INITIAL_COMPOSITION, shadowBlurPx: -5 };
    expect(estimateShadowPreviewMetrics(compLow).shadowBlurPx).toBe(0);

    const compHigh = { ...INITIAL_COMPOSITION, shadowBlurPx: 100 };
    expect(estimateShadowPreviewMetrics(compHigh).shadowBlurPx).toBe(40);

    const compMid = { ...INITIAL_COMPOSITION, shadowBlurPx: 20 };
    expect(estimateShadowPreviewMetrics(compMid).shadowBlurPx).toBe(20);
  });

  it('produces positive widthPct and heightPct', () => {
    const m = estimateShadowPreviewMetrics(INITIAL_COMPOSITION);
    expect(m.shadowWidthPct).toBeGreaterThan(0);
    expect(m.shadowHeightPct).toBeGreaterThan(0);
  });

  it('varies shadow width with stanceWidthPct', () => {
    const narrow = estimateShadowPreviewMetrics(INITIAL_COMPOSITION, 10);
    const wide = estimateShadowPreviewMetrics(INITIAL_COMPOSITION, 80);
    expect(wide.shadowWidthPct).toBeGreaterThan(narrow.shadowWidthPct);
  });

  it('handles lightDirection at 90 degrees', () => {
    const comp = { ...INITIAL_COMPOSITION, lightDirectionDeg: 90 };
    const m = estimateShadowPreviewMetrics(comp);
    // 90 + 180 = 270
    expect(m.shadowAngleDeg).toBe(270);
  });
});
