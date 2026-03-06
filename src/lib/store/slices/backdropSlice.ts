import type { StateCreator } from 'zustand';
import type { AppState, BackdropSlice } from '../types';
import type { BackdropAsset, BackdropGenerationState } from '@/types/backdrop';
import { BACKDROP_DEFAULT_PROMPT } from '@/lib/constants';

const INITIAL_GENERATION: BackdropGenerationState = {
  status: 'idle',
  prompt: BACKDROP_DEFAULT_PROMPT,
  model: 'flux',
};

export type BackdropSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  BackdropSlice
>;

export const createBackdropSlice: BackdropSliceCreator = (set) => ({
  backdrops: [],
  activeBackdropId: null,
  generation: { ...INITIAL_GENERATION },

  addBackdrop: (asset: BackdropAsset) =>
    set((draft) => {
      draft.backdrops.push(asset);
      // Auto-select if nothing active
      if (draft.activeBackdropId === null) {
        draft.activeBackdropId = asset.id;
      }
    }),

  removeBackdrop: (id: string) =>
    set((draft) => {
      const idx = draft.backdrops.findIndex((b: BackdropAsset) => b.id === id);
      if (idx === -1) return;
      draft.backdrops.splice(idx, 1);
      if (draft.activeBackdropId === id) {
        draft.activeBackdropId =
          draft.backdrops[idx]?.id ?? draft.backdrops[idx - 1]?.id ?? null;
      }
    }),

  setActiveBackdrop: (id: string | null) =>
    set((draft) => {
      draft.activeBackdropId = id;
    }),

  setGeneration: (partial: Partial<BackdropGenerationState>) =>
    set((draft) => {
      Object.assign(draft.generation, partial);
    }),

  resetGeneration: () =>
    set((draft) => {
      draft.generation = { ...INITIAL_GENERATION };
    }),
});
