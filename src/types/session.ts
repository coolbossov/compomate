import type { CompositionState, ExportProfileId, NameStyleId } from '@/lib/shared/composition';
import type { FontPairId } from './composition';

export interface SessionSettings {
  jobName: string;
  lastBackdropId?: string;
  lastExportProfile: ExportProfileId;
  lastNameStyle: NameStyleId;
  lastFontPairId: FontPairId;
  lockSettings: boolean;
  savedAt: number;
}

export interface Template {
  id: string;
  name: string;
  composition: CompositionState;
  exportProfile: ExportProfileId;
  nameStyle: NameStyleId;
  fontPairId: FontPairId;
  createdAt: number;
  updatedAt: number;
}
