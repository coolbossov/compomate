// File and asset types

export interface Asset {
  id: string;
  name: string;
  file: File;
  objectUrl: string;
  r2Key?: string;
  width: number;
  height: number;
}

export interface PoseAnalysis {
  stanceWidthPct: number;
  leanPct: number;
  subjectAspect: number;
}

export interface PreviewRect {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}
