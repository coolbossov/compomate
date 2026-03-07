import type {
  CompositionState,
  ExportProfileId,
  NameStyleId,
} from "@/lib/shared/composition";
import { PROJECT_SNAPSHOT_VERSION } from "@/lib/constants";

export type SerializedAsset = {
  name: string;
  dataUrl?: string;
  r2Key?: string;
};

export type ProjectSnapshot = {
  version: 1 | typeof PROJECT_SNAPSHOT_VERSION;
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

function isSerializedAsset(value: unknown): value is SerializedAsset {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    name?: unknown;
    dataUrl?: unknown;
    r2Key?: unknown;
  };

  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    return false;
  }

  const hasDataUrl = typeof candidate.dataUrl === "string" && candidate.dataUrl.startsWith("data:");
  const hasR2Key = typeof candidate.r2Key === "string" && candidate.r2Key.trim() !== "";

  return hasDataUrl || hasR2Key;
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    nameStyle?: unknown;
    exportProfile?: unknown;
    composition?: unknown;
    activeBackdrop?: unknown;
    activeSubject?: unknown;
  };

  const version = candidate.version;
  if (version !== 1 && version !== PROJECT_SNAPSHOT_VERSION) {
    return false;
  }

  if (typeof candidate.firstName !== "string" || typeof candidate.lastName !== "string") {
    return false;
  }

  if (!candidate.composition || typeof candidate.composition !== "object") {
    return false;
  }

  const backdropOkay =
    candidate.activeBackdrop === null || isSerializedAsset(candidate.activeBackdrop);
  const subjectOkay =
    candidate.activeSubject === null || isSerializedAsset(candidate.activeSubject);

  return backdropOkay && subjectOkay;
}
