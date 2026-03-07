/**
 * CompoMate — Zustand store
 *
 * Middleware stack (outer → inner):
 *   persist  → saves session settings to localStorage
 *   temporal → zundo undo/redo over UndoableState
 *   immer    → allows mutable Draft updates in all slice setters
 */

import { create, useStore as useZustandStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { StateCreator } from 'zustand';
import type { TemporalState } from 'zundo';

import type { AppState, UndoableState } from './types';
import { createFilesSlice } from './slices/filesSlice';
import { createBackdropSlice } from './slices/backdropSlice';
import { createCompositionSlice } from './slices/compositionSlice';
import { createNamesSlice } from './slices/namesSlice';
import { createExportSlice } from './slices/exportSlice';
import { createUISlice } from './slices/uiSlice';
import { SESSION_STORAGE_KEY } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Combined creator — all slices merged under immer
// The Mps tuple [['zustand/immer', never]] tells TypeScript that immer has
// been applied, so `set` inside each slice allows Draft mutations.
// ---------------------------------------------------------------------------

const storeCreator: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  AppState
> = (set, get, api) => ({
  ...createFilesSlice(set, get, api),
  ...createBackdropSlice(set, get, api),
  ...createCompositionSlice(set, get, api),
  ...createNamesSlice(set, get, api),
  ...createExportSlice(set, get, api),
  ...createUISlice(set, get, api),
});

// ---------------------------------------------------------------------------
// Fields tracked by zundo for undo/redo
// (composition tweaks and name edits — NOT files, backdrops, export, or UI)
// ---------------------------------------------------------------------------

const temporalPartialize = (state: AppState): UndoableState => ({
  composition: state.composition,
  nameStyleId: state.nameStyleId,
  fontPairId: state.fontPairId,
  firstName: state.firstName,
  lastName: state.lastName,
  nameSizePct: state.nameSizePct,
  nameYFromBottomPct: state.nameYFromBottomPct,
});

// ---------------------------------------------------------------------------
// Fields saved to localStorage for session continuity
// (NOT subjects/backdrops — those are object-URL based; NOT batch/approval/UI)
// ---------------------------------------------------------------------------

const persistPartialize = (state: AppState) => ({
  jobName: state.jobName,
  lockSettings: state.lockSettings,
  exportProfileId: state.exportProfileId,
  nameStyleId: state.nameStyleId,
  fontPairId: state.fontPairId,
  stickyLastName: state.stickyLastName,
  nameOverlayEnabled: state.nameOverlayEnabled,
  composition: state.composition,
  nameSizePct: state.nameSizePct,
  nameYFromBottomPct: state.nameYFromBottomPct,
  leftTab: state.leftTab,
  showSafeArea: state.showSafeArea ?? true,
});

// ---------------------------------------------------------------------------
// Main store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>()(
  persist(
    temporal(
      immer(storeCreator) as unknown as StateCreator<
        AppState,
        [['temporal', unknown]],
        [],
        AppState
      >,
      {
        partialize: temporalPartialize,
        limit: 50,
      },
    ),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          // No-op storage for SSR — store is not persisted server-side
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: persistPartialize,
    },
  ),
);

// ---------------------------------------------------------------------------
// Temporal store hook (undo / redo state)
// ---------------------------------------------------------------------------

export const useTemporalStore = <T>(
  selector: (state: TemporalState<UndoableState>) => T,
): T => useZustandStore(useStore.temporal, selector);

// ---------------------------------------------------------------------------
// Imperative undo / redo (usable outside React, e.g. keyboard shortcuts)
// ---------------------------------------------------------------------------

export const undo = (steps?: number): void =>
  useStore.temporal.getState().undo(steps);

export const redo = (steps?: number): void =>
  useStore.temporal.getState().redo(steps);

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type { AppState, UndoableState } from './types';
