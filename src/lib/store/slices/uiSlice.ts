import type { StateCreator } from 'zustand';
import type { AppState, UISlice } from '../types';
import { CANVAS_MIN_ZOOM, EXPORT_TOAST_DURATION_MS } from '@/lib/constants';

export type UISliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  UISlice
>;

export const createUISlice: UISliceCreator = (set, get) => ({
  leftTab: 'files',
  showShortcuts: false,
  showSideBySide: false,
  showDangerZone: false,
  canvasZoom: 1,
  toastMessage: null,
  toastTimeout: null,

  setLeftTab: (tab: 'files' | 'backdrops') =>
    set((draft) => {
      draft.leftTab = tab;
    }),

  setShowShortcuts: (v: boolean) =>
    set((draft) => {
      draft.showShortcuts = v;
    }),

  setShowSideBySide: (v: boolean) =>
    set((draft) => {
      draft.showSideBySide = v;
    }),

  setShowDangerZone: (v: boolean) =>
    set((draft) => {
      draft.showDangerZone = v;
    }),

  setCanvasZoom: (zoom: number) =>
    set((draft) => {
      draft.canvasZoom = zoom;
    }),

  showToast: (message: string, durationMs = EXPORT_TOAST_DURATION_MS) => {
    // Clear any existing timer imperatively before mutating state
    const existing = get().toastTimeout;
    if (existing !== null) clearTimeout(existing);

    const timeout = setTimeout(() => {
      set((draft) => {
        draft.toastMessage = null;
        draft.toastTimeout = null;
      });
    }, durationMs);

    set((draft) => {
      draft.toastMessage = message;
      draft.toastTimeout = timeout;
    });
  },

  clearToast: () => {
    const existing = get().toastTimeout;
    if (existing !== null) clearTimeout(existing);
    set((draft) => {
      draft.toastMessage = null;
      draft.toastTimeout = null;
    });
  },
});
