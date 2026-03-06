export type ExportProfileId = "original" | "8x10" | "5x7" | "4x5" | "1x1";

export type NameStyleId = "classic" | "outline" | "modern";

export type CompositionState = {
  xPct: number;
  yPct: number;
  subjectHeightPct: number;
  reflectionEnabled: boolean;
  reflectionSizePct: number;
  reflectionPositionPct: number;
  reflectionOpacityPct: number;
  reflectionBlurPx: number;
  legFadeEnabled: boolean;
  legFadeStartPct: number;
  fogEnabled: boolean;
  fogOpacityPct: number;
  fogHeightPct: number;
  shadowEnabled: boolean;
  shadowStrengthPct: number;
  lightDirectionDeg: number;
  lightElevationDeg: number;
  shadowStretchPct: number;
  shadowBlurPx: number;
};

export const INITIAL_COMPOSITION: CompositionState = {
  xPct: 50,
  yPct: 84,
  subjectHeightPct: 64,
  reflectionEnabled: true,
  reflectionSizePct: 100,
  reflectionPositionPct: 100,
  reflectionOpacityPct: 36,
  reflectionBlurPx: 2,
  legFadeEnabled: false,
  legFadeStartPct: 74,
  fogEnabled: false,
  fogOpacityPct: 30,
  fogHeightPct: 26,
  shadowEnabled: true,
  shadowStrengthPct: 40,
  lightDirectionDeg: 38,
  lightElevationDeg: 40,
  shadowStretchPct: 100,
  shadowBlurPx: 12,
};

export type ExportProfile = {
  id: ExportProfileId;
  label: string;
  widthIn: number | null;
  heightIn: number | null;
  widthPx: number | null;
  heightPx: number | null;
  aspectRatio: number | null;
  description: string;
};

export const EXPORT_PROFILES: Record<ExportProfileId, ExportProfile> = {
  original: {
    id: "original",
    label: "Original Canvas",
    widthIn: null,
    heightIn: null,
    widthPx: null,
    heightPx: null,
    aspectRatio: null,
    description: "Keep backdrop dimensions and aspect ratio.",
  },
  "8x10": {
    id: "8x10",
    label: "8 x 10",
    widthIn: 8,
    heightIn: 10,
    widthPx: 2400,
    heightPx: 3000,
    aspectRatio: 8 / 10,
    description: "Portrait print profile at 300 DPI.",
  },
  "5x7": {
    id: "5x7",
    label: "5 x 7",
    widthIn: 5,
    heightIn: 7,
    widthPx: 1500,
    heightPx: 2100,
    aspectRatio: 5 / 7,
    description: "Portrait print profile at 300 DPI.",
  },
  "4x5": {
    id: "4x5",
    label: "4 x 5",
    widthIn: 4,
    heightIn: 5,
    widthPx: 1200,
    heightPx: 1500,
    aspectRatio: 4 / 5,
    description: "Portrait print profile at 300 DPI.",
  },
  "1x1": {
    id: "1x1",
    label: "1 x 1",
    widthIn: 8,
    heightIn: 8,
    widthPx: 2400,
    heightPx: 2400,
    aspectRatio: 1,
    description: "Square profile at 300 DPI.",
  },
};

export const NAME_STYLE_OPTIONS: { id: NameStyleId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "outline", label: "Outline" },
  { id: "modern", label: "Modern" },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function wrapDegrees(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function getExportProfile(profileId: ExportProfileId): ExportProfile {
  return EXPORT_PROFILES[profileId];
}

export type ShadowPreviewMetrics = {
  shadowAngleDeg: number;
  shadowWidthPct: number;
  shadowHeightPct: number;
  shadowOffsetXPct: number;
  shadowOffsetYPct: number;
  shadowOpacity: number;
  shadowBlurPx: number;
};

export function estimateShadowPreviewMetrics(
  composition: CompositionState,
  stanceWidthPct = 34,
  leanPct = 0,
): ShadowPreviewMetrics {
  const angle = wrapDegrees(composition.lightDirectionDeg + 180 + leanPct * 12);
  const angleRad = (angle * Math.PI) / 180;
  const elevationFactor = 1 - clamp(composition.lightElevationDeg, 5, 85) / 90;
  const stretch = clamp(composition.shadowStretchPct / 100, 0.35, 2.5);
  const length = (0.55 + elevationFactor * 0.95) * stretch;

  const subjectScale = composition.subjectHeightPct;
  const widthPct =
    subjectScale * (0.45 + clamp(stanceWidthPct / 100, 0.12, 0.8) * 0.55) * length;
  const heightPct = Math.max(2, subjectScale * (0.08 + (1 - elevationFactor) * 0.05));
  const offsetXPct = Math.cos(angleRad) * subjectScale * (0.08 + elevationFactor * 0.18);
  const offsetYPct = Math.sin(angleRad) * subjectScale * (0.03 + elevationFactor * 0.08);

  return {
    shadowAngleDeg: angle,
    shadowWidthPct: widthPct,
    shadowHeightPct: heightPct,
    shadowOffsetXPct: offsetXPct,
    shadowOffsetYPct: offsetYPct,
    shadowOpacity: clamp(composition.shadowStrengthPct / 100, 0, 1),
    shadowBlurPx: clamp(composition.shadowBlurPx, 0, 40),
  };
}
