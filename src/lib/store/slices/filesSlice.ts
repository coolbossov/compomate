import type { StateCreator } from 'zustand';
import type { AppState, FilesSlice } from '../types';
import type { Asset } from '@/types/files';

export type FilesSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  FilesSlice
>;

export const createFilesSlice: FilesSliceCreator = (set) => ({
  subjects: [],
  activeSubjectId: null,

  addSubjects: (assets: Asset[]) =>
    set((draft) => {
      draft.subjects.push(...assets);
      // Auto-select first asset if nothing is active
      if (draft.activeSubjectId === null && assets.length > 0) {
        draft.activeSubjectId = assets[0].id;
      }
    }),

  replaceSubjects: (assets: Asset[]) =>
    set((draft) => {
      draft.subjects = assets;
      draft.activeSubjectId = assets[0]?.id ?? null;
    }),

  removeSubject: (id: string) =>
    set((draft) => {
      const idx = draft.subjects.findIndex((s: Asset) => s.id === id);
      if (idx === -1) return;
      draft.subjects.splice(idx, 1);
      // Re-select if we removed the active subject
      if (draft.activeSubjectId === id) {
        draft.activeSubjectId =
          draft.subjects[idx]?.id ?? draft.subjects[idx - 1]?.id ?? null;
      }
    }),

  updateSubject: (id: string, patch: Partial<Asset>) =>
    set((draft) => {
      const subject = draft.subjects.find((s: Asset) => s.id === id);
      if (subject) Object.assign(subject, patch);
    }),

  setActiveSubject: (id: string | null) =>
    set((draft) => {
      draft.activeSubjectId = id;
    }),

  nextSubject: () =>
    set((draft) => {
      if (draft.subjects.length === 0) return;
      const idx = draft.subjects.findIndex((s: Asset) => s.id === draft.activeSubjectId);
      const nextIdx = (idx + 1) % draft.subjects.length;
      draft.activeSubjectId = draft.subjects[nextIdx].id;
    }),

  prevSubject: () =>
    set((draft) => {
      if (draft.subjects.length === 0) return;
      const idx = draft.subjects.findIndex((s: Asset) => s.id === draft.activeSubjectId);
      const prevIdx = (idx - 1 + draft.subjects.length) % draft.subjects.length;
      draft.activeSubjectId = draft.subjects[prevIdx].id;
    }),
});
