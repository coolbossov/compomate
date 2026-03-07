import {
  EXPORT_WIDTH_PX,
  EXPORT_HEIGHT_PX,
  EXPORT_DPI,
  CROP_ZONES,
  FONT_PAIRS,
  BLEND_PRESETS,
  SLIDER_BOUNDS,
  MAX_FILE_BYTES,
  MAX_FILES_PER_IMPORT,
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
  buildExportFilename,
} from './constants';

// ── Export dimensions ────────────────────────────────────────
describe('export dimensions', () => {
  it('EXPORT_WIDTH_PX is 4000', () => {
    expect(EXPORT_WIDTH_PX).toBe(4000);
  });

  it('EXPORT_HEIGHT_PX is 5000', () => {
    expect(EXPORT_HEIGHT_PX).toBe(5000);
  });

  it('EXPORT_DPI is 300', () => {
    expect(EXPORT_DPI).toBe(300);
  });
});

// ── Crop zones ──────────────────────────────────────────────
describe('CROP_ZONES', () => {
  it('4x6 widthFrac is approximately 0.833', () => {
    expect(CROP_ZONES['4x6'].widthFrac).toBeCloseTo(0.833, 2);
  });

  it('4x6 heightFrac is 1.0', () => {
    expect(CROP_ZONES['4x6'].heightFrac).toBe(1.0);
  });

  it('5x7 widthFrac is approximately 0.893', () => {
    expect(CROP_ZONES['5x7'].widthFrac).toBeCloseTo(0.893, 2);
  });

  it('5x7 heightFrac is 1.0', () => {
    expect(CROP_ZONES['5x7'].heightFrac).toBe(1.0);
  });
});

// ── Font pairs ──────────────────────────────────────────────
describe('FONT_PAIRS', () => {
  it('has at least 2 entries', () => {
    expect(FONT_PAIRS.length).toBeGreaterThanOrEqual(2);
  });

  it('each pair has font files ending in .ttf or .otf', () => {
    for (const pair of FONT_PAIRS) {
      expect(pair.firstNameFont).toMatch(/\.(ttf|otf)$/);
      expect(pair.lastNameFont).toMatch(/\.(ttf|otf)$/);
    }
  });

  it('each pair has an id and label', () => {
    for (const pair of FONT_PAIRS) {
      expect(pair.id).toBeTruthy();
      expect(pair.label).toBeTruthy();
    }
  });
});

// ── Blend presets ───────────────────────────────────────────
describe('BLEND_PRESETS', () => {
  it('has soft, studio, and dramatic keys', () => {
    expect(BLEND_PRESETS).toHaveProperty('soft');
    expect(BLEND_PRESETS).toHaveProperty('studio');
    expect(BLEND_PRESETS).toHaveProperty('dramatic');
  });

  it('each preset has shadowEnabled and reflectionEnabled', () => {
    for (const preset of Object.values(BLEND_PRESETS)) {
      expect(typeof preset.shadowEnabled).toBe('boolean');
      expect(typeof preset.reflectionEnabled).toBe('boolean');
    }
  });

  it('dramatic has higher shadow strength than soft', () => {
    expect(BLEND_PRESETS.dramatic.shadowStrengthPct).toBeGreaterThan(
      BLEND_PRESETS.soft.shadowStrengthPct,
    );
  });
});

// ── Slider bounds ───────────────────────────────────────────
describe('SLIDER_BOUNDS', () => {
  const expectedFields = [
    'xPct', 'yPct', 'subjectHeightPct',
    'shadowStrengthPct', 'lightDirectionDeg', 'lightElevationDeg',
    'shadowStretchPct', 'shadowBlurPx',
    'reflectionSizePct', 'reflectionPositionPct', 'reflectionOpacityPct', 'reflectionBlurPx',
    'legFadeStartPct', 'fogOpacityPct', 'fogHeightPct',
  ];

  it('has entries for all composition slider fields', () => {
    for (const field of expectedFields) {
      expect(SLIDER_BOUNDS).toHaveProperty(field);
    }
  });

  it('each entry has min, max, step', () => {
    for (const field of expectedFields) {
      const bounds = SLIDER_BOUNDS[field as keyof typeof SLIDER_BOUNDS];
      expect(bounds).toHaveProperty('min');
      expect(bounds).toHaveProperty('max');
      expect(bounds).toHaveProperty('step');
      expect(bounds.min).toBeLessThan(bounds.max);
      expect(bounds.step).toBeGreaterThan(0);
    }
  });
});

// ── File limits ─────────────────────────────────────────────
describe('file limits', () => {
  it('MAX_FILE_BYTES is positive', () => {
    expect(MAX_FILE_BYTES).toBeGreaterThan(0);
  });

  it('MAX_FILES_PER_IMPORT is positive', () => {
    expect(MAX_FILES_PER_IMPORT).toBeGreaterThan(0);
  });
});

// ── Canvas zoom ─────────────────────────────────────────────
describe('canvas zoom limits', () => {
  it('CANVAS_MIN_ZOOM < CANVAS_MAX_ZOOM', () => {
    expect(CANVAS_MIN_ZOOM).toBeLessThan(CANVAS_MAX_ZOOM);
  });

  it('CANVAS_MIN_ZOOM is positive', () => {
    expect(CANVAS_MIN_ZOOM).toBeGreaterThan(0);
  });
});

// ── buildExportFilename ─────────────────────────────────────
describe('buildExportFilename', () => {
  it('builds standard filename', () => {
    const name = buildExportFilename('SpringShoot', 'Jane', 'Doe', 1);
    expect(name).toBe('SpringShoot-Jane-Doe-0001.png');
  });

  it('pads index to 4 digits', () => {
    expect(buildExportFilename('Job', 'A', 'B', 1)).toContain('-0001.png');
    expect(buildExportFilename('Job', 'A', 'B', 9999)).toContain('-9999.png');
  });

  it('replaces spaces with hyphens in job name', () => {
    const name = buildExportFilename('Spring Shoot', 'Jane', 'Doe', 1);
    expect(name).toBe('Spring-Shoot-Jane-Doe-0001.png');
  });

  it('uses defaults for empty strings', () => {
    const name = buildExportFilename('', '', '', 1);
    expect(name).toBe('Job-Unknown-Unknown-0001.png');
  });

  it('trims whitespace-only names', () => {
    const name = buildExportFilename('  ', '  ', '  ', 2);
    expect(name).toBe('Job-Unknown-Unknown-0002.png');
  });
});
