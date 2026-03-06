import type {
  CompositionState,
  ExportProfileId,
  NameStyleId,
} from "@/lib/shared/composition";

export type SerializedAsset = {
  name: string;
  dataUrl: string;
};

export type ProjectSnapshot = {
  version: 1;
  firstName: string;
  lastName: string;
  nameStyle: NameStyleId;
  exportProfile: ExportProfileId;
  composition: CompositionState;
  activeBackdrop: SerializedAsset | null;
  activeSubject: SerializedAsset | null;
};

export type StoredProjectSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
