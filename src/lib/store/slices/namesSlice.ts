import type { StateCreator } from 'zustand';
import type { AppState, NamesSlice } from '../types';
import { NAME_OVERLAY_DEFAULTS } from '@/lib/constants';

export type NamesSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  NamesSlice
>;

export const createNamesSlice: NamesSliceCreator = (set) => ({
  firstName: '',
  lastName: '',
  stickyLastName: false,
  nameOverlayEnabled: NAME_OVERLAY_DEFAULTS.enabled,
  nameSizePct: NAME_OVERLAY_DEFAULTS.sizePct,
  nameYFromBottomPct: NAME_OVERLAY_DEFAULTS.yFromBottomPct,

  setFirstName: (v: string) =>
    set((draft) => {
      draft.firstName = v;
    }),

  setLastName: (v: string) =>
    set((draft) => {
      draft.lastName = v;
    }),

  setStickyLastName: (v: boolean) =>
    set((draft) => {
      draft.stickyLastName = v;
    }),

  setNameOverlayEnabled: (v: boolean) =>
    set((draft) => {
      draft.nameOverlayEnabled = v;
    }),

  setNameSizePct: (v: number) =>
    set((draft) => {
      draft.nameSizePct = v;
    }),

  setNameYFromBottomPct: (v: number) =>
    set((draft) => {
      draft.nameYFromBottomPct = v;
    }),

  /**
   * Paste a full name and split on the first whitespace.
   * "John Smith"    → firstName="John",    lastName="Smith"
   * "Mary Jo Smith" → firstName="Mary",    lastName="Jo Smith"
   * "Madonna"       → firstName="Madonna", lastName unchanged
   */
  pasteAutoSplit: (text: string) =>
    set((draft) => {
      const trimmed = text.trim();
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx === -1) {
        // Single token — treat as first name only
        draft.firstName = trimmed;
      } else {
        draft.firstName = trimmed.slice(0, spaceIdx);
        draft.lastName = trimmed.slice(spaceIdx + 1).trim();
      }
    }),

  /**
   * Called when advancing to the next file.
   * Always clears firstName; keeps lastName when stickyLastName is true.
   */
  clearForNextFile: () =>
    set((draft) => {
      draft.firstName = '';
      if (!draft.stickyLastName) {
        draft.lastName = '';
      }
    }),
});
