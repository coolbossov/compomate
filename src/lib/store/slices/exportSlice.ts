import type { StateCreator } from 'zustand';
import type { AppState, ExportSlice } from '../types';
import type { BatchItem } from '@/types/export';
import { DEFAULT_JOB_NAME } from '@/lib/constants';

export type ExportSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ExportSlice
>;

export const createExportSlice: ExportSliceCreator = (set) => ({
  jobName: DEFAULT_JOB_NAME,
  batchItems: [],
  exportCounter: 0,
  approvalGiven: false,

  setJobName: (name: string) =>
    set((draft) => {
      draft.jobName = name;
    }),

  addBatchItem: (item: BatchItem) =>
    set((draft) => {
      draft.batchItems.push(item);
    }),

  updateBatchItem: (id: string, patch: Partial<BatchItem>) =>
    set((draft) => {
      const item = draft.batchItems.find((b: BatchItem) => b.id === id);
      if (item) Object.assign(item, patch);
    }),

  removeBatchItem: (id: string) =>
    set((draft) => {
      const idx = draft.batchItems.findIndex((b: BatchItem) => b.id === id);
      if (idx === -1) return;
      if (draft.batchItems[idx].status === 'running') return; // don't remove in-flight items
      draft.batchItems.splice(idx, 1);
    }),

  clearBatch: () =>
    set((draft) => {
      draft.batchItems = [];
    }),

  setApprovalGiven: (v: boolean) =>
    set((draft) => {
      draft.approvalGiven = v;
    }),

  incrementExportCounter: () =>
    set((draft) => {
      draft.exportCounter += 1;
    }),
});
