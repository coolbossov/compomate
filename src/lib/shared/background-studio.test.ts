import { describe, expect, it } from 'vitest';
import {
  buildBackgroundDirectionPrompt,
  DEFAULT_BACKGROUND_STUDIO_STATE,
  isBackgroundStudioState,
} from './background-studio';

describe('background studio direction', () => {
  it('builds a safe niche-agnostic plate prompt with pose and palette guidance', () => {
    const prompt = buildBackgroundDirectionPrompt({
      ...DEFAULT_BACKGROUND_STUDIO_STATE,
      activity: 'Gymnastics',
      poseCount: 3,
      refinement: 'make the center calmer',
    });
    expect(prompt).toContain('gymnastics portrait background plate');
    expect(prompt).toContain('three clear full-height subject zones');
    expect(prompt).toContain('#0d5c3d');
    expect(prompt).toContain('completely empty');
    expect(prompt).toContain('Zero people');
    expect(prompt).toContain('no people');
    expect(prompt).toContain('no people');
    expect(prompt).toContain('uploaded logo will be added later');
    expect(prompt).toContain('make the center calmer');
  });

  it('uses the selected headshot environment', () => {
    const prompt = buildBackgroundDirectionPrompt({
      ...DEFAULT_BACKGROUND_STUDIO_STATE,
      activity: 'Headshots',
      headshotEnvironment: 'conference-room',
    });
    expect(prompt).toContain('executive conference room');
    expect(prompt).not.toContain('volleyball');
  });

  it('validates serializable state', () => {
    expect(isBackgroundStudioState(DEFAULT_BACKGROUND_STUDIO_STATE)).toBe(true);
    expect(isBackgroundStudioState({ ...DEFAULT_BACKGROUND_STUDIO_STATE, poseCount: 4 })).toBe(false);
  });
});
