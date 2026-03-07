import type { StateCreator } from 'zustand';
import type { AppState, UISlice } from '../types';
import { CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM, EXPORT_TOAST_DURATION_MS } from '@/lib/constants';

export type UISliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  UISlice
>;

export const createUISlice: UISliceCreator = (set) => ({
  leftTab: 'files',
  showShortcuts: false,
  showSideBySide: false,
  showDangerZone: false,
  showSafeArea: true,
  canvasZoom: 1,
  toastMessage: null,

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

  setShowSafeArea: (v: boolean) =>
    set((draft) => {
      draft.showSafeArea = v;
    }),

  setCanvasZoom: (zoom: number) =>
    set((draft) => {
      draft.canvasZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, zoom));
    }),

  showToast: (message: string, durationMs = EXPORT_TOAST_DURATION_MS) => {
    set((draft) => {
      draft.toastMessage = {
        id: Date.now(),
        message,
        durationMs,
      };
    });
  },

  clearToast: () => {
    set((draft) => {
      draft.toastMessage = null;
    });
  },
});
