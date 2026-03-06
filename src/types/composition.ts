// Re-export everything from the shared composition module
export * from '@/lib/shared/composition';

import type { CompositionState, ExportProfileId, NameStyleId } from '@/lib/shared/composition';

// Font pair definitions
export type FontPairId = 'classic' | 'modern';

export interface FontPair {
  id: FontPairId;
  label: string;
  firstNameFont: string;    // filename in public/fonts/
  lastNameFont: string;
}

export interface NameOverlayConfig {
  firstName: string;
  lastName: string;
  style: NameStyleId;
  fontPairId: FontPairId;
  enabled: boolean;
  sizePct: number;          // relative to canvas height, default 8
  yFromBottomPct: number;   // default 5
}

// CompositeSpec — normalized parameters consumed by both Konva preview and Sharp export
export interface CompositeSpec {
  subjectUrl: string;        // object URL (preview) or R2 key (export)
  backdropUrl: string;       // same
  composition: CompositionState;
  exportProfile: ExportProfileId;
  nameOverlay: NameOverlayConfig;
  outputWidthPx: number;
  outputHeightPx: number;
}
