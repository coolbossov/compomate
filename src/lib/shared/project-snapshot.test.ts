import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKGROUND_STUDIO_STATE } from './background-studio';
import { isProjectSnapshot } from './project-snapshot';
import { PROJECT_SNAPSHOT_VERSION } from '@/lib/constants';

const composition = {
  xPct: 50, yPct: 85, subjectHeightPct: 82, rotationDeg: 0,
  lightDirectionDeg: 315, lightElevationDeg: 32,
  shadowEnabled: true, shadowStrengthPct: 56, shadowStretchPct: 132, shadowBlurPx: 16,
  reflectionEnabled: true, reflectionSizePct: 116, reflectionPositionPct: 100,
  reflectionOpacityPct: 44, reflectionBlurPx: 5,
  legFadeEnabled: false, legFadeStartPct: 78,
  fogEnabled: true, fogOpacityPct: 34, fogHeightPct: 31,
};

describe('project snapshot v3', () => {
  it('accepts a complete restorable studio workspace', () => {
    expect(isProjectSnapshot({
      version: PROJECT_SNAPSHOT_VERSION,
      firstName: '', lastName: '', nameStyle: 'classic', exportProfile: 'print-4x5', composition,
      activeBackdrop: null, activeSubject: null,
      backdrops: [{
        id: 'direction-1', name: 'Direction 1.jpg', r2Key: 'backdrops/direction-1.jpg',
        width: 1024, height: 1280, source: 'ai-direction', stage: 'direction', createdAt: 1,
      }],
      activeBackdropId: 'direction-1',
      backgroundStudio: DEFAULT_BACKGROUND_STUDIO_STATE,
    })).toBe(true);
  });

  it('rejects v3 without the complete studio state', () => {
    expect(isProjectSnapshot({
      version: PROJECT_SNAPSHOT_VERSION,
      firstName: '', lastName: '', nameStyle: 'classic', exportProfile: 'print-4x5', composition,
      activeBackdrop: null, activeSubject: null, backdrops: [], activeBackdropId: null,
    })).toBe(false);
  });

  it('continues to accept a legacy v2 snapshot', () => {
    expect(isProjectSnapshot({
      version: 2,
      firstName: '', lastName: '', nameStyle: 'classic', exportProfile: 'print-4x5', composition,
      activeBackdrop: null, activeSubject: null,
    })).toBe(true);
  });
});
