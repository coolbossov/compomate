import type { StateCreator } from 'zustand';
import type { AppState, CompositionSlice } from '../types';
import type { ExportProfileId, NameStyleId } from '@/lib/shared/composition';
import type { FontPairId } from '@/types/composition';
import { INITIAL_COMPOSITION } from '@/lib/shared/composition';
import { BLEND_PRESETS, DEFAULT_FONT_PAIR } from '@/lib/constants';

export type CompositionSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  CompositionSlice
>;

export const createCompositionSlice: CompositionSliceCreator = (set) => ({
  composition: { ...INITIAL_COMPOSITION },
  exportProfileId: 'original' as ExportProfileId,
  nameStyleId: 'classic' as NameStyleId,
  fontPairId: DEFAULT_FONT_PAIR as FontPairId,
  lockSettings: false,

  updateComposition: (patch) =>
    set((draft) => {
      Object.assign(draft.composition, patch);
    }),

  setExportProfile: (id: ExportProfileId) =>
    set((draft) => {
      draft.exportProfileId = id;
    }),

  setNameStyle: (id: NameStyleId) =>
    set((draft) => {
      draft.nameStyleId = id;
    }),

  setFontPair: (id: FontPairId) =>
    set((draft) => {
      draft.fontPairId = id;
    }),

  setLockSettings: (locked: boolean) =>
    set((draft) => {
      draft.lockSettings = locked;
    }),

  resetComposition: () =>
    set((draft) => {
      draft.composition = { ...INITIAL_COMPOSITION };
    }),

  applyBlendPreset: (preset: 'soft' | 'studio' | 'dramatic') =>
    set((draft) => {
      // Merge only the keys present in the preset (e.g. 'studio' omits fog values)
      Object.assign(draft.composition, BLEND_PRESETS[preset]);
    }),
});
