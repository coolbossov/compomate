import type { StateCreator } from 'zustand';
import type { AppState, BackgroundStudioSlice } from '../types';
import { DEFAULT_BACKGROUND_STUDIO_STATE } from '@/lib/shared/background-studio';

export type BackgroundStudioSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  BackgroundStudioSlice
>;

export const createBackgroundStudioSlice: BackgroundStudioSliceCreator = (set) => ({
  backgroundStudio: { ...DEFAULT_BACKGROUND_STUDIO_STATE },
  updateBackgroundStudio: (patch) => set((draft) => {
    Object.assign(draft.backgroundStudio, patch);
  }),
  replaceBackgroundStudio: (state) => set((draft) => {
    draft.backgroundStudio = state;
  }),
});
