// Central type definitions for the Zustand store.
// All slice interfaces live here to avoid circular imports between slices and index.ts.

import type { Asset } from '@/types/files';
import type { BackdropAsset, BackdropGenerationState } from '@/types/backdrop';
import type { CompositionState, ExportProfileId, NameStyleId } from '@/lib/shared/composition';
import type { BatchItem, ExportQueueSummary } from '@/types/export';
import type { FontPairId } from '@/types/composition';

// ---------------------------------------------------------------------------
// Files slice
// ---------------------------------------------------------------------------

export interface FilesSlice {
  subjects: Asset[];
  activeSubjectId: string | null;
  addSubjects: (assets: Asset[]) => void;
  removeSubject: (id: string) => void;
  setActiveSubject: (id: string | null) => void;
  nextSubject: () => void;
  prevSubject: () => void;
}

// ---------------------------------------------------------------------------
// Backdrop slice
// ---------------------------------------------------------------------------

export interface BackdropSlice {
  backdrops: BackdropAsset[];
  activeBackdropId: string | null;
  generation: BackdropGenerationState;
  addBackdrop: (asset: BackdropAsset) => void;
  removeBackdrop: (id: string) => void;
  setActiveBackdrop: (id: string | null) => void;
  setGeneration: (state: Partial<BackdropGenerationState>) => void;
  resetGeneration: () => void;
}

// ---------------------------------------------------------------------------
// Composition slice
// ---------------------------------------------------------------------------

export interface CompositionSlice {
  composition: CompositionState;
  exportProfileId: ExportProfileId;
  nameStyleId: NameStyleId;
  fontPairId: FontPairId;
  lockSettings: boolean;
  updateComposition: (patch: Partial<CompositionState>) => void;
  setExportProfile: (id: ExportProfileId) => void;
  setNameStyle: (id: NameStyleId) => void;
  setFontPair: (id: FontPairId) => void;
  setLockSettings: (locked: boolean) => void;
  resetComposition: () => void;
  applyBlendPreset: (preset: 'soft' | 'studio' | 'dramatic') => void;
}

// ---------------------------------------------------------------------------
// Names slice
// ---------------------------------------------------------------------------

export interface NamesSlice {
  firstName: string;
  lastName: string;
  stickyLastName: boolean;
  nameOverlayEnabled: boolean;
  nameSizePct: number;
  nameYFromBottomPct: number;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setStickyLastName: (v: boolean) => void;
  setNameOverlayEnabled: (v: boolean) => void;
  setNameSizePct: (v: number) => void;
  setNameYFromBottomPct: (v: number) => void;
  pasteAutoSplit: (text: string) => void;
  clearForNextFile: () => void;
}

// ---------------------------------------------------------------------------
// Export slice
// ---------------------------------------------------------------------------

export interface ExportSlice {
  jobName: string;
  batchItems: BatchItem[];
  exportCounter: number;
  approvalGiven: boolean;
  setJobName: (name: string) => void;
  addBatchItem: (item: BatchItem) => void;
  updateBatchItem: (id: string, patch: Partial<BatchItem>) => void;
  removeBatchItem: (id: string) => void;
  clearBatch: () => void;
  setApprovalGiven: (v: boolean) => void;
  incrementExportCounter: () => void;
  getQueueSummary: () => ExportQueueSummary;
}

// ---------------------------------------------------------------------------
// UI slice
// ---------------------------------------------------------------------------

export interface UISlice {
  leftTab: 'files' | 'backdrops';
  showShortcuts: boolean;
  showSideBySide: boolean;
  showDangerZone: boolean;
  showSafeArea: boolean;
  canvasZoom: number;
  toastMessage: string | null;
  toastTimeout: ReturnType<typeof setTimeout> | null;
  setLeftTab: (tab: 'files' | 'backdrops') => void;
  setShowShortcuts: (v: boolean) => void;
  setShowSideBySide: (v: boolean) => void;
  setShowDangerZone: (v: boolean) => void;
  setShowSafeArea: (v: boolean) => void;
  setCanvasZoom: (zoom: number) => void;
  showToast: (message: string, durationMs?: number) => void;
  clearToast: () => void;
}

// ---------------------------------------------------------------------------
// Combined store type
// ---------------------------------------------------------------------------

export type AppState = FilesSlice &
  BackdropSlice &
  CompositionSlice &
  NamesSlice &
  ExportSlice &
  UISlice;

// ---------------------------------------------------------------------------
// Undoable state — the subset tracked by zundo for undo/redo
// ---------------------------------------------------------------------------

export type UndoableState = {
  composition: CompositionState;
  nameStyleId: NameStyleId;
  fontPairId: FontPairId;
  firstName: string;
  lastName: string;
};
