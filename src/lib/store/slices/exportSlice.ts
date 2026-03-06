import type { StateCreator } from 'zustand';
import type { AppState, ExportSlice } from '../types';
import type { BatchItem, ExportQueueSummary } from '@/types/export';
import { DEFAULT_JOB_NAME } from '@/lib/constants';

export type ExportSliceCreator = StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ExportSlice
>;

export const createExportSlice: ExportSliceCreator = (set, get) => ({
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
      if (idx !== -1) draft.batchItems.splice(idx, 1);
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

  getQueueSummary: (): ExportQueueSummary => {
    const { batchItems } = get();
    return {
      done: batchItems.filter((i) => i.status === 'done').length,
      running: batchItems.filter((i) => i.status === 'running').length,
      pending: batchItems.filter((i) => i.status === 'pending').length,
      failed: batchItems.filter((i) => i.status === 'failed').length,
      total: batchItems.length,
    };
  },
});
