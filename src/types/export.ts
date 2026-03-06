import type { CompositionState, ExportProfileId, NameStyleId } from '@/lib/shared/composition';
import type { FontPairId } from './composition';

export type BatchStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface BatchItem {
  id: string;
  label: string;
  backdropId: string;
  subjectId: string;
  firstName: string;
  lastName: string;
  composition: CompositionState;
  exportProfile: ExportProfileId;
  nameStyle: NameStyleId;
  fontPairId: FontPairId;
  status: BatchStatus;
  error?: string;
  exportedFilename?: string;
}

export interface ExportQueueSummary {
  done: number;
  running: number;
  pending: number;
  failed: number;
  total: number;
}

// Fal.ai backdrop generation types
export interface FalBackdropPendingPayload {
  pending: true;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  queuePosition?: number;
  model: string;
}

export interface FalBackdropCompletedPayload {
  pending: false;
  dataUrl?: string;
  sourceUrl?: string;
  model: string;
}

export type FalBackdropPayload = FalBackdropPendingPayload | FalBackdropCompletedPayload;

export function isFalPending(p: FalBackdropPayload): p is FalBackdropPendingPayload {
  return p.pending === true;
}

export function isFalCompleted(p: FalBackdropPayload): p is FalBackdropCompletedPayload {
  return p.pending === false;
}
