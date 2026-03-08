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
  rosterQueue: [],

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
      if (idx === -1) {
        draft.activeSubjectId = draft.subjects[0].id;
        return;
      }
      draft.activeSubjectId = draft.subjects[(idx + 1) % draft.subjects.length].id;
    }),

  prevSubject: () =>
    set((draft) => {
      if (draft.subjects.length === 0) return;
      const idx = draft.subjects.findIndex((s: Asset) => s.id === draft.activeSubjectId);
      if (idx === -1) {
        draft.activeSubjectId = draft.subjects[draft.subjects.length - 1].id;
        return;
      }
      draft.activeSubjectId = draft.subjects[(idx - 1 + draft.subjects.length) % draft.subjects.length].id;
    }),

  markExported: (id: string) =>
    set((draft) => {
      const subject = draft.subjects.find((s: Asset) => s.id === id);
      if (subject) subject.exported = true;
    }),

  loadRoster: (rows) =>
    set((draft) => {
      if (rows.length === 0) {
        draft.rosterQueue = [];
        return;
      }
      // If a subject is already active, apply the first row immediately and
      // store the remainder as the queue. Otherwise keep all rows queued so
      // the first applyNextRosterEntry call (on initial subject activation)
      // consumes row 0.
      if (draft.activeSubjectId !== null) {
        draft.firstName = rows[0].firstName;
        draft.lastName = rows[0].lastName;
        draft.rosterQueue = rows.slice(1);
      } else {
        draft.rosterQueue = rows.slice();
      }
    }),

  clearRoster: () =>
    set((draft) => {
      draft.rosterQueue = [];
    }),

  applyNextRosterEntry: () =>
    set((draft) => {
      if (draft.rosterQueue.length === 0) return;
      // Read values before mutating (immer Draft proxy safety)
      const nextFirst = draft.rosterQueue[0].firstName;
      const nextLast = draft.rosterQueue[0].lastName;
      draft.rosterQueue.splice(0, 1);
      draft.firstName = nextFirst;
      draft.lastName = nextLast;
    }),
});
