import type { CompositionState } from '@/lib/shared/composition';
import type { NameOverlayConfig } from '@/types/composition';

export interface CompositorInput {
  subjectBuffer: Buffer;       // raw PNG/TIFF subject with transparency
  backdropBuffer: Buffer;      // backdrop image
  composition: CompositionState;
  outputWidth: number;         // always 4000
  outputHeight: number;        // always 5000
  nameOverlay?: NameOverlayConfig;
  fontBasePath: string;        // path to public/fonts/ directory
}

export interface CompositorOutput {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'png';
}

export interface PlacementResult {
  left: number;     // px from left of output canvas
  top: number;      // px from top of output canvas
  width: number;    // subject width in px
  height: number;   // subject height in px
}

export interface PoseMetrics {
  feetYPct: number;          // where feet are (0-1, from top)
  hipCenterXPct: number;     // horizontal center of hips (0-1)
  shoulderWidthPct: number;  // shoulder width as fraction of subject width
  stanceWidthPct: number;    // stance width as fraction of subject width
  leanPct: number;           // lean direction (-1 left, +1 right)
}
