/**
 * Client-side utility functions extracted from page.tsx (Batch 3 component refactor).
 * All functions run in the browser only.
 */

import type { Asset } from '@/types/files';
import type { BackdropAsset } from '@/types/backdrop';
import type { ExportProfileId } from '@/lib/shared/composition';
import { EXPORT_PROFILES } from '@/lib/shared/composition';
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_IMPORT,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith('.tif') || lower.endsWith('.tiff');
}

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

export function parseErrorText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Data URL / Blob helpers
// ---------------------------------------------------------------------------

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) throw new Error('Invalid data URL.');
  const mimeMatch = header.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for export optimization.'));
    image.src = url;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Failed to encode image.')); return; }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed reading ${file.name}`));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Image dimension loading
// ---------------------------------------------------------------------------

export function loadImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Asset creation
// ---------------------------------------------------------------------------

export async function fileToAsset(file: File): Promise<Asset> {
  const objectUrl = URL.createObjectURL(file);
  const dimensions = await loadImageDimensions(objectUrl);
  return {
    id: makeId(),
    name: file.name,
    file,
    objectUrl,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export async function fileToBackdropAsset(file: File): Promise<BackdropAsset> {
  const objectUrl = URL.createObjectURL(file);
  const dims = await loadImageDimensions(objectUrl);
  return {
    id: makeId(),
    name: file.name,
    objectUrl,
    width: dims.width,
    height: dims.height,
    source: 'upload',
    createdAt: Date.now(),
  };
}

export async function dataUrlToAsset(name: string, dataUrl: string): Promise<Asset> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  return fileToAsset(file);
}

export async function dataUrlToBackdropAsset(
  name: string,
  dataUrl: string,
  prompt?: string,
): Promise<BackdropAsset> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  const objectUrl = URL.createObjectURL(file);
  const dims = await loadImageDimensions(objectUrl);
  return {
    id: makeId(),
    name,
    objectUrl,
    width: dims.width,
    height: dims.height,
    source: 'ai-flux',
    prompt,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Batch asset loading
// ---------------------------------------------------------------------------

export async function filesToAssets(files: File[]): Promise<{ assets: Asset[]; skipped: string[] }> {
  const skipped: string[] = [];
  const imageFiles = files.filter(isImageFile);
  const limitedFiles = imageFiles.slice(0, MAX_FILES_PER_IMPORT);

  if (imageFiles.length > limitedFiles.length) {
    skipped.push(`${imageFiles.length - limitedFiles.length} file(s) skipped (import limit ${MAX_FILES_PER_IMPORT}).`);
  }

  const assets: Asset[] = [];
  for (const file of limitedFiles) {
    if (file.size > MAX_FILE_BYTES) {
      skipped.push(`${file.name} skipped (file too large).`);
      continue;
    }
    try {
      assets.push(await fileToAsset(file));
    } catch (error) {
      skipped.push(error instanceof Error ? error.message : 'Failed to load file.');
    }
  }
  return { assets, skipped };
}

export async function filesToBackdropAssets(files: File[]): Promise<{ assets: BackdropAsset[]; skipped: string[] }> {
  const skipped: string[] = [];
  const imageFiles = files.filter(isImageFile);
  const limitedFiles = imageFiles.slice(0, MAX_FILES_PER_IMPORT);

  if (imageFiles.length > limitedFiles.length) {
    skipped.push(`${imageFiles.length - limitedFiles.length} file(s) skipped (import limit ${MAX_FILES_PER_IMPORT}).`);
  }

  const assets: BackdropAsset[] = [];
  for (const file of limitedFiles) {
    if (file.size > MAX_FILE_BYTES) {
      skipped.push(`${file.name} skipped (file too large).`);
      continue;
    }
    try {
      assets.push(await fileToBackdropAsset(file));
    } catch (error) {
      skipped.push(error instanceof Error ? error.message : 'Failed to load file.');
    }
  }
  return { assets, skipped };
}

export async function collectImageFiles(directory: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  const dir = directory as FileSystemDirectoryHandle & { values?: () => AsyncIterable<FileSystemHandle> };
  if (!dir.values) return files;

  for await (const entry of dir.values.call(directory)) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      if (isImageFile(file)) files.push(file);
      continue;
    }
    const childFiles = await collectImageFiles(entry as FileSystemDirectoryHandle);
    files.push(...childFiles);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Subject pose analysis
// ---------------------------------------------------------------------------

export type PoseAnalysis = {
  stanceWidthPct: number;
  leanPct: number;
  subjectAspect: number;
};

import { clamp } from '@/lib/shared/composition';

export async function analyzeSubjectPose(objectUrl: string): Promise<PoseAnalysis> {
  const image = new Image();
  image.src = objectUrl;
  await image.decode();

  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { stanceWidthPct: 34, leanPct: 0, subjectAspect: width / height };

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3] ?? 0;
  const stanceStart = Math.floor(height * 0.72);
  let minX = width, maxX = 0, count = 0;

  for (let y = stanceStart; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) < 18) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); count++;
    }
  }

  const topEnd = Math.floor(height * 0.3);
  const bottomStart = Math.floor(height * 0.65);
  let topX = 0, topCount = 0, bottomX = 0, bottomCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) < 18) continue;
      if (y <= topEnd) { topX += x; topCount++; }
      if (y >= bottomStart) { bottomX += x; bottomCount++; }
    }
  }

  const stanceWidthPct = count > 0 ? clamp(((maxX - minX) / Math.max(1, width)) * 100, 10, 90) : 34;
  const topCenter = topCount > 0 ? topX / topCount : width / 2;
  const bottomCenter = bottomCount > 0 ? bottomX / bottomCount : width / 2;
  const leanPct = clamp(((topCenter - bottomCenter) / Math.max(1, width)) * 100, -25, 25);

  return { stanceWidthPct, leanPct, subjectAspect: width / Math.max(1, height) };
}

// ---------------------------------------------------------------------------
// Backdrop light direction detection
// ---------------------------------------------------------------------------

export function directionFromVector(dx: number, dy: number): number {
  const radians = Math.atan2(dx, -dy);
  const degrees = (radians * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export async function detectBackdropLightDirection(
  objectUrl: string,
  footXPct: number,
  footYPct: number,
): Promise<number> {
  const image = new Image();
  image.src = objectUrl;
  await image.decode();

  const sampleW = 140, sampleH = 140;
  const canvas = document.createElement('canvas');
  canvas.width = sampleW; canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 35;

  ctx.clearRect(0, 0, sampleW, sampleH);
  ctx.drawImage(image, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  let bestBrightness = -1;
  let bestX = Math.round(sampleW * 0.2);
  let bestY = Math.round(sampleH * 0.2);

  const searchBottom = Math.floor(sampleH * 0.7);
  for (let y = 0; y < searchBottom; y++) {
    for (let x = 0; x < sampleW; x++) {
      const i = (y * sampleW + x) * 4;
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
      const brightness = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (brightness <= bestBrightness) continue;
      bestBrightness = brightness; bestX = x; bestY = y;
    }
  }

  const brightXPct = (bestX / sampleW) * 100;
  const brightYPct = (bestY / sampleH) * 100;
  return directionFromVector(brightXPct - footXPct, brightYPct - footYPct);
}

// ---------------------------------------------------------------------------
// Project snapshot validation
// ---------------------------------------------------------------------------

import type { ProjectSnapshot } from '@/lib/shared/project-snapshot';

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') return false;
  return (value as { version?: unknown }).version === 1;
}

// ---------------------------------------------------------------------------
// Export payload helpers (kept for backward compat — R2 migration is separate)
// ---------------------------------------------------------------------------

async function rasterizeForExport(
  sourceUrl: string,
  options: { maxLongSide: number; mimeType: string; quality: number },
): Promise<Blob> {
  const image = await loadImageElement(sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, options.maxLongSide / Math.max(1, Math.max(width, height)));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');
  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(image, 0, 0, tw, th);
  return canvasToBlob(canvas, options.mimeType, options.quality);
}

export async function prepareExportPayload(
  backdropUrl: string,
  subjectUrl: string,
  exportProfile: ExportProfileId,
): Promise<{ backdropBlob: Blob; subjectBlob: Blob; totalBytes: number }> {
  const profile = EXPORT_PROFILES[exportProfile];
  const profileLongSide =
    profile.widthPx && profile.heightPx ? Math.max(profile.widthPx, profile.heightPx) : 3200;

  let backdropLong = Math.round(profileLongSide * 1.55);
  let subjectLong = Math.round(profileLongSide * 1.25);
  let backdropQ = 0.9;
  let subjectQ = 0.92;

  let lastBackdrop = await rasterizeForExport(backdropUrl, { maxLongSide: backdropLong, mimeType: 'image/jpeg', quality: backdropQ });
  let lastSubject = await rasterizeForExport(subjectUrl, { maxLongSide: subjectLong, mimeType: 'image/webp', quality: subjectQ });
  let totalBytes = lastBackdrop.size + lastSubject.size;

  for (let attempt = 0; attempt < 5 && totalBytes > 3_700_000; attempt++) {
    backdropLong = Math.max(1400, Math.round(backdropLong * 0.87));
    subjectLong = Math.max(1100, Math.round(subjectLong * 0.9));
    backdropQ = Math.max(0.64, backdropQ - 0.06);
    subjectQ = Math.max(0.68, subjectQ - 0.07);
    lastBackdrop = await rasterizeForExport(backdropUrl, { maxLongSide: backdropLong, mimeType: 'image/jpeg', quality: backdropQ });
    lastSubject = await rasterizeForExport(subjectUrl, { maxLongSide: subjectLong, mimeType: 'image/webp', quality: subjectQ });
    totalBytes = lastBackdrop.size + lastSubject.size;
  }

  return { backdropBlob: lastBackdrop, subjectBlob: lastSubject, totalBytes };
}

// ---------------------------------------------------------------------------
// File name builder (export)
// ---------------------------------------------------------------------------

export function buildDownloadFilename(
  firstName: string,
  lastName: string,
  exportProfileId: ExportProfileId,
): string {
  const safeFirst = firstName.trim().replace(/\s+/g, '_');
  const safeLast = lastName.trim().replace(/\s+/g, '_');
  const namePart = [safeLast, safeFirst].filter(Boolean).join('_');
  const profilePart = exportProfileId === 'original' ? '' : `_${exportProfileId}`;
  return namePart
    ? `${namePart}${profilePart}_compomate.png`
    : `compomate${profilePart}_export.png`;
}
