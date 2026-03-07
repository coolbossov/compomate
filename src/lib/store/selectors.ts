/**
 * Selector hooks — stable, memoised subscriptions to specific store slices.
 *
 * Import from here rather than reaching into useStore directly so that
 * each component subscribes only to the state it actually needs.
 */

import { useStore, useTemporalStore } from './index';

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** The currently active subject Asset, or null if none selected. */
export const useActiveSubject = () =>
  useStore((s) => s.subjects.find((a) => a.id === s.activeSubjectId) ?? null);

/** All loaded subject assets. */
export const useSubjects = () => useStore((s) => s.subjects);

// ---------------------------------------------------------------------------
// Backdrops
// ---------------------------------------------------------------------------

/** The currently active backdrop asset, or null if none selected. */
export const useActiveBackdrop = () =>
  useStore((s) => s.backdrops.find((a) => a.id === s.activeBackdropId) ?? null);

/** All loaded backdrop assets. */
export const useBackdrops = () => useStore((s) => s.backdrops);

/** AI generation state (status, prompt, model, etc.) */
export const useGeneration = () => useStore((s) => s.generation);

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Current CompositionState (xPct, yPct, shadows, reflections, …). */
export const useComposition = () => useStore((s) => s.composition);

/** Active export profile ID. */
export const useExportProfile = () => useStore((s) => s.exportProfileId);

/** Active name style ID. */
export const useNameStyle = () => useStore((s) => s.nameStyleId);

/** Active font pair ID. */
export const useFontPair = () => useStore((s) => s.fontPairId);

/** Whether lock-settings mode is active (composition stays fixed between files). */
export const useLockSettings = () => useStore((s) => s.lockSettings);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** First name field value. */
export const useFirstName = () => useStore((s) => s.firstName);

/** Last name field value. */
export const useLastName = () => useStore((s) => s.lastName);

/** Whether last name persists when advancing to the next subject file. */
export const useStickyLastName = () => useStore((s) => s.stickyLastName);

/** Whether the name overlay is rendered on the canvas. */
export const useNameOverlayEnabled = () => useStore((s) => s.nameOverlayEnabled);

/** Name overlay size as a percentage of canvas height. */
export const useNameSizePct = () => useStore((s) => s.nameSizePct);

/** Name overlay vertical position from the bottom of the canvas (%). */
export const useNameYFromBottomPct = () => useStore((s) => s.nameYFromBottomPct);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Current job / session name used in export filenames. */
export const useJobName = () => useStore((s) => s.jobName);

/** All items in the export batch queue. */
export const useBatchItems = () => useStore((s) => s.batchItems);

/** Running count of exports completed this session (used for sequential numbering). */
export const useExportCounter = () => useStore((s) => s.exportCounter);

/** Whether the user has given approval after previewing the first export. */
export const useApprovalGiven = () => useStore((s) => s.approvalGiven);

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/** Active left panel tab ('files' | 'backdrops'). */
export const useLeftTab = () => useStore((s) => s.leftTab);

/** Whether the keyboard shortcuts panel is visible. */
export const useShowShortcuts = () => useStore((s) => s.showShortcuts);

/** Whether the side-by-side comparison view is active. */
export const useShowSideBySide = () => useStore((s) => s.showSideBySide);

/** Whether the danger zone (destructive actions) section is expanded. */
export const useShowDangerZone = () => useStore((s) => s.showDangerZone);

/** Whether the safe area overlay is shown on the canvas. */
export const useShowSafeArea = () => useStore((s) => s.showSafeArea);

/** Current canvas zoom level (1.0 = 100%). */
export const useCanvasZoom = () => useStore((s) => s.canvasZoom);

/** Pending toast event, or null when no toast should be shown. */
export const useToastMessage = () => useStore((s) => s.toastMessage);

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

/** True when there is at least one state in the undo history. */
export const useCanUndo = () =>
  useTemporalStore((s) => s.pastStates.length > 0);

/** True when there is at least one state in the redo stack. */
export const useCanRedo = () =>
  useTemporalStore((s) => s.futureStates.length > 0);

/** Number of undo steps available. */
export const useUndoCount = () =>
  useTemporalStore((s) => s.pastStates.length);

/** Number of redo steps available. */
export const useRedoCount = () =>
  useTemporalStore((s) => s.futureStates.length);
