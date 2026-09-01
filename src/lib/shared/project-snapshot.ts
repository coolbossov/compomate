import type {
  CompositionState,
  ExportProfileId,
  NameStyleId,
} from "@/lib/shared/composition";
import { PROJECT_SNAPSHOT_VERSION } from "@/lib/constants";
import type { BackdropAsset } from "@/types/backdrop";
import {
  isBackgroundStudioState,
  type BackgroundStudioState,
} from "@/lib/shared/background-studio";

export type SerializedAsset = {
  name: string;
  dataUrl?: string;
  r2Key?: string;
};

export type SerializedBackdropAsset = SerializedAsset & {
  id: string;
  width: number;
  height: number;
  source: BackdropAsset['source'];
  prompt?: string;
  stage?: BackdropAsset['stage'];
  providerSourceUrl?: string;
  createdAt: number;
};

export type ProjectSnapshot = {
  version: 1 | 2 | typeof PROJECT_SNAPSHOT_VERSION;
  firstName: string;
  lastName: string;
  nameStyle: NameStyleId;
  exportProfile: ExportProfileId;
  composition: CompositionState;
  activeBackdrop: SerializedAsset | null;
  activeSubject: SerializedAsset | null;
  /** Version 3 restores the complete Background Studio workspace. */
  backdrops?: SerializedBackdropAsset[];
  activeBackdropId?: string | null;
  backgroundStudio?: BackgroundStudioState;
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

function isSerializedBackdropAsset(value: unknown): value is SerializedBackdropAsset {
  if (!isSerializedAsset(value)) return false;
  const candidate = value as Partial<SerializedBackdropAsset>;
  return typeof candidate.id === 'string'
    && typeof candidate.width === 'number'
    && Number.isFinite(candidate.width)
    && typeof candidate.height === 'number'
    && Number.isFinite(candidate.height)
    && ['upload', 'ai-flux', 'ai-ideogram', 'ai-direction', 'ai-master', 'reference'].includes(String(candidate.source))
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt)
    && (candidate.stage === undefined || candidate.stage === 'direction' || candidate.stage === 'master')
    && (candidate.prompt === undefined || typeof candidate.prompt === 'string')
    && (candidate.providerSourceUrl === undefined || typeof candidate.providerSourceUrl === 'string');
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
    backdrops?: unknown;
    activeBackdropId?: unknown;
    backgroundStudio?: unknown;
  };

  const version = candidate.version;
  if (version !== 1 && version !== 2 && version !== PROJECT_SNAPSHOT_VERSION) {
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

  if (!backdropOkay || !subjectOkay) return false;

  if (version === PROJECT_SNAPSHOT_VERSION) {
    if (!Array.isArray(candidate.backdrops) || !candidate.backdrops.every(isSerializedBackdropAsset)) return false;
    if (!(candidate.activeBackdropId === null || typeof candidate.activeBackdropId === 'string')) return false;
    if (!isBackgroundStudioState(candidate.backgroundStudio)) return false;
  }

  return true;
}
