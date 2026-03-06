"use client";
/* eslint-disable @next/next/no-img-element */

import JSZip from "jszip";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  clamp,
  estimateShadowPreviewMetrics,
  EXPORT_PROFILES,
  INITIAL_COMPOSITION,
  NAME_STYLE_OPTIONS,
  type CompositionState,
  type ExportProfileId,
  type NameStyleId,
} from "@/lib/shared/composition";
import type {
  ProjectSnapshot,
  StoredProjectSummary,
} from "@/lib/shared/project-snapshot";

type Asset = {
  id: string;
  name: string;
  objectUrl: string;
  dataUrl: string;
  width: number;
  height: number;
};

type PoseAnalysis = {
  stanceWidthPct: number;
  leanPct: number;
  subjectAspect: number;
};

type BatchStatus = "pending" | "running" | "done" | "failed" | "cancelled";

type BatchItem = {
  id: string;
  label: string;
  backdropId: string;
  subjectId: string;
  firstName: string;
  lastName: string;
  composition: CompositionState;
  exportProfile: ExportProfileId;
  nameStyle: NameStyleId;
  status: BatchStatus;
  error?: string;
};

const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_FILES_PER_IMPORT = 120;
const BACKDROP_POLL_INTERVAL_MS = 2200;
const BACKDROP_MAX_POLLS = 180;

type FalBackdropPendingPayload = {
  pending: true;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  queuePosition: number | null;
  model: string;
};

type FalBackdropCompletedPayload = {
  pending: false;
  dataUrl: string;
  sourceUrl: string;
  model: string;
};

function isFalBackdropPendingPayload(value: unknown): value is FalBackdropPendingPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<FalBackdropPendingPayload>;
  return (
    payload.pending === true &&
    typeof payload.statusUrl === "string" &&
    typeof payload.responseUrl === "string"
  );
}

function isFalBackdropCompletedPayload(value: unknown): value is FalBackdropCompletedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<FalBackdropCompletedPayload>;
  return payload.pending === false && typeof payload.dataUrl === "string";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith(".tif") || lower.endsWith(".tiff");
}

function parseErrorText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  if (!header || !base64) {
    throw new Error("Invalid data URL.");
  }
  const mimeMatch = header.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for export optimization."));
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function rasterizeForExport(
  sourceUrl: string,
  options: {
    maxLongSide: number;
    mimeType: string;
    quality: number;
  },
): Promise<Blob> {
  const image = await loadImageElement(sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longSide = Math.max(width, height);
  const scale = Math.min(1, options.maxLongSide / Math.max(1, longSide));

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable.");
  }
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvasToBlob(canvas, options.mimeType, options.quality);
}

async function prepareExportPayload(
  backdrop: Asset,
  subject: Asset,
  exportProfile: ExportProfileId,
): Promise<{
  backdropBlob: Blob;
  subjectBlob: Blob;
  totalBytes: number;
}> {
  const profile = EXPORT_PROFILES[exportProfile];
  const profileLongSide = profile.widthPx && profile.heightPx
    ? Math.max(profile.widthPx, profile.heightPx)
    : 3200;

  let backdropLong = Math.round(profileLongSide * 1.55);
  let subjectLong = Math.round(profileLongSide * 1.25);
  let backdropQuality = 0.9;
  let subjectQuality = 0.92;

  let lastBackdropBlob = await rasterizeForExport(backdrop.objectUrl, {
    maxLongSide: backdropLong,
    mimeType: "image/jpeg",
    quality: backdropQuality,
  });
  let lastSubjectBlob = await rasterizeForExport(subject.objectUrl, {
    maxLongSide: subjectLong,
    mimeType: "image/webp",
    quality: subjectQuality,
  });

  let totalBytes = lastBackdropBlob.size + lastSubjectBlob.size;
  const targetBudget = 3_700_000;

  for (let attempt = 0; attempt < 5 && totalBytes > targetBudget; attempt += 1) {
    backdropLong = Math.max(1400, Math.round(backdropLong * 0.87));
    subjectLong = Math.max(1100, Math.round(subjectLong * 0.9));
    backdropQuality = Math.max(0.64, backdropQuality - 0.06);
    subjectQuality = Math.max(0.68, subjectQuality - 0.07);

    lastBackdropBlob = await rasterizeForExport(backdrop.objectUrl, {
      maxLongSide: backdropLong,
      mimeType: "image/jpeg",
      quality: backdropQuality,
    });
    lastSubjectBlob = await rasterizeForExport(subject.objectUrl, {
      maxLongSide: subjectLong,
      mimeType: "image/webp",
      quality: subjectQuality,
    });
    totalBytes = lastBackdropBlob.size + lastSubjectBlob.size;
  }

  return { backdropBlob: lastBackdropBlob, subjectBlob: lastSubjectBlob, totalBytes };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed reading ${file.name}`));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    };
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = objectUrl;
  });
}

async function fileToAsset(file: File, dataUrl?: string): Promise<Asset> {
  const objectUrl = URL.createObjectURL(file);
  const sourceDataUrl = dataUrl ?? (await fileToDataUrl(file));
  const dimensions = await loadImageDimensions(objectUrl);
  return {
    id: makeId(),
    name: file.name,
    objectUrl,
    dataUrl: sourceDataUrl,
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function dataUrlToAsset(name: string, dataUrl: string): Promise<Asset> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], name, { type: blob.type || "image/png" });
  return fileToAsset(file, dataUrl);
}

async function filesToAssets(files: File[]): Promise<{
  assets: Asset[];
  skipped: string[];
}> {
  const skipped: string[] = [];
  const imageFiles = files.filter(isImageFile);
  const limitedFiles = imageFiles.slice(0, MAX_FILES_PER_IMPORT);

  if (imageFiles.length > limitedFiles.length) {
    skipped.push(
      `${imageFiles.length - limitedFiles.length} file(s) skipped (import limit ${MAX_FILES_PER_IMPORT}).`,
    );
  }

  const settled = await Promise.allSettled(
    limitedFiles.map(async (file) => {
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${file.name} skipped (file too large).`);
        return null;
      }
      return fileToAsset(file);
    }),
  );

  const assets: Asset[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      assets.push(result.value);
      continue;
    }
    if (result.status === "rejected") {
      skipped.push(result.reason instanceof Error ? result.reason.message : "Failed to load file.");
    }
  }

  return { assets, skipped };
}

async function collectImageFiles(
  directory: FileSystemDirectoryHandle,
): Promise<File[]> {
  const files: File[] = [];
  const directoryIterator = (
    directory as FileSystemDirectoryHandle & {
      values?: () => AsyncIterable<FileSystemHandle>;
    }
  ).values;

  if (!directoryIterator) {
    return files;
  }

  for await (const entry of directoryIterator.call(directory)) {
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      if (isImageFile(file)) {
        files.push(file);
      }
      continue;
    }
    const childFiles = await collectImageFiles(entry as FileSystemDirectoryHandle);
    files.push(...childFiles);
  }

  return files;
}

async function analyzeSubjectPose(objectUrl: string): Promise<PoseAnalysis> {
  const image = new Image();
  image.src = objectUrl;
  await image.decode();

  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { stanceWidthPct: 34, leanPct: 0, subjectAspect: width / height };
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3] ?? 0;

  const stanceStart = Math.floor(height * 0.72);
  let minX = width;
  let maxX = 0;
  let count = 0;

  for (let y = stanceStart; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) < 18) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      count += 1;
    }
  }

  const topEnd = Math.floor(height * 0.3);
  const bottomStart = Math.floor(height * 0.65);
  let topX = 0;
  let topCount = 0;
  let bottomX = 0;
  let bottomCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) < 18) {
        continue;
      }
      if (y <= topEnd) {
        topX += x;
        topCount += 1;
      }
      if (y >= bottomStart) {
        bottomX += x;
        bottomCount += 1;
      }
    }
  }

  const stanceWidthPct =
    count > 0 ? clamp(((maxX - minX) / Math.max(1, width)) * 100, 10, 90) : 34;
  const topCenter = topCount > 0 ? topX / topCount : width / 2;
  const bottomCenter = bottomCount > 0 ? bottomX / bottomCount : width / 2;
  const leanPct = clamp(((topCenter - bottomCenter) / Math.max(1, width)) * 100, -25, 25);

  return {
    stanceWidthPct,
    leanPct,
    subjectAspect: width / Math.max(1, height),
  };
}

function directionFromVector(dx: number, dy: number): number {
  const radians = Math.atan2(dx, -dy);
  const degrees = (radians * 180) / Math.PI;
  return (degrees + 360) % 360;
}

async function detectBackdropLightDirection(
  objectUrl: string,
  footXPct: number,
  footYPct: number,
): Promise<number> {
  const image = new Image();
  image.src = objectUrl;
  await image.decode();

  const sampleWidth = 140;
  const sampleHeight = 140;
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return 35;
  }

  context.clearRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);

  let bestBrightness = -1;
  let bestX = Math.round(sampleWidth * 0.2);
  let bestY = Math.round(sampleHeight * 0.2);

  const searchBottom = Math.floor(sampleHeight * 0.7);
  for (let y = 0; y < searchBottom; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const brightness = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (brightness <= bestBrightness) {
        continue;
      }
      bestBrightness = brightness;
      bestX = x;
      bestY = y;
    }
  }

  const brightXPct = (bestX / sampleWidth) * 100;
  const brightYPct = (bestY / sampleHeight) * 100;
  const vectorX = brightXPct - footXPct;
  const vectorY = brightYPct - footYPct;

  return directionFromVector(vectorX, vectorY);
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { version?: unknown };
  return candidate.version === 1;
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
        <span>{label}</span>
        <span className="font-mono text-[var(--text-primary)]">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        className="w-full accent-[var(--brand-primary)]"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleControl({
  label,
  checked = false,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--brand-primary)]"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export default function Home() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingPointerRef = useRef<number | null>(null);
  const batchAbortRef = useRef(false);
  const objectUrlsRef = useRef(new Set<string>());

  const [backdrops, setBackdrops] = useState<Asset[]>([]);
  const [subjects, setSubjects] = useState<Asset[]>([]);
  const [activeBackdropId, setActiveBackdropId] = useState<string | null>(null);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  const [composition, setComposition] = useState<CompositionState>(INITIAL_COMPOSITION);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameStyle, setNameStyle] = useState<NameStyleId>("classic");
  const [exportProfileId, setExportProfileId] = useState<ExportProfileId>("original");
  const [showSafeArea, setShowSafeArea] = useState(true);

  const [status, setStatus] = useState("Load a backdrop and a dancer PNG.");
  const [isExporting, setIsExporting] = useState(false);

  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [poseAnalysis, setPoseAnalysis] = useState<PoseAnalysis | null>(null);
  const [isAutoTuning, setIsAutoTuning] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateStyleHint, setGenerateStyleHint] = useState(
    "Studio dance portrait, clean floor reflections, cinematic haze",
  );
  const [generateAspectMode, setGenerateAspectMode] = useState<
    "portrait" | "landscape" | "square"
  >("portrait");
  const [isGeneratingBackdrop, setIsGeneratingBackdrop] = useState(false);

  const [projectName, setProjectName] = useState("Session");
  const [savedProjects, setSavedProjects] = useState<StoredProjectSummary[]>([]);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | null>(null);

  const activeBackdrop = useMemo(
    () => backdrops.find((backdrop) => backdrop.id === activeBackdropId) ?? null,
    [backdrops, activeBackdropId],
  );

  const activeSubject = useMemo(
    () => subjects.find((subject) => subject.id === activeSubjectId) ?? null,
    [subjects, activeSubjectId],
  );

  const activeProfile = EXPORT_PROFILES[exportProfileId];

  const reflectionHeight = Math.max(
    0.5,
    composition.subjectHeightPct * (composition.reflectionSizePct / 100),
  );
  const reflectionTop = clamp(
    composition.yPct +
      ((composition.reflectionPositionPct - 100) / 100) *
        (composition.subjectHeightPct * 0.25),
    0,
    100,
  );

  const subjectFadeMask = composition.legFadeEnabled
    ? `linear-gradient(to bottom, rgba(0, 0, 0, 1) ${composition.legFadeStartPct}%, transparent 100%)`
    : undefined;

  const fogOpacity = clamp(composition.fogOpacityPct / 100, 0, 1);

  const shadowMetrics = estimateShadowPreviewMetrics(
    composition,
    poseAnalysis?.stanceWidthPct ?? 34,
    (poseAnalysis?.leanPct ?? 0) / 100,
  );

  const safeAreaBox = useMemo(() => {
    if (!activeProfile.aspectRatio) {
      return { widthPct: 100, heightPct: 100, leftPct: 0, topPct: 0 };
    }

    const containerRatio = canvasSize.width / Math.max(1, canvasSize.height);
    if (containerRatio >= activeProfile.aspectRatio) {
      const widthPct = clamp((activeProfile.aspectRatio / containerRatio) * 100, 1, 100);
      return {
        widthPct,
        heightPct: 100,
        leftPct: (100 - widthPct) / 2,
        topPct: 0,
      };
    }

    const heightPct = clamp((containerRatio / activeProfile.aspectRatio) * 100, 1, 100);
    return {
      widthPct: 100,
      heightPct,
      leftPct: 0,
      topPct: (100 - heightPct) / 2,
    };
  }, [activeProfile.aspectRatio, canvasSize]);

  useEffect(() => {
    const registeredUrls = objectUrlsRef.current;
    return () => {
      for (const url of registeredUrls) {
        URL.revokeObjectURL(url);
      }
      registeredUrls.clear();
    };
  }, []);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setCanvasSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeSubject) {
      setPoseAnalysis(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const analysis = await analyzeSubjectPose(activeSubject.objectUrl);
        if (!cancelled) {
          setPoseAnalysis(analysis);
        }
      } catch {
        if (!cancelled) {
          setPoseAnalysis({ stanceWidthPct: 34, leanPct: 0, subjectAspect: 0.52 });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSubject]);

  function registerAssets(assets: Asset[]): void {
    for (const asset of assets) {
      objectUrlsRef.current.add(asset.objectUrl);
    }
  }

  function revokeAsset(asset: Asset): void {
    if (objectUrlsRef.current.has(asset.objectUrl)) {
      URL.revokeObjectURL(asset.objectUrl);
      objectUrlsRef.current.delete(asset.objectUrl);
    }
  }

  function removeBackdrop(assetId: string): void {
    let didRemove = false;
    setBackdrops((current) => {
      const target = current.find((item) => item.id === assetId);
      if (!target) {
        return current;
      }
      didRemove = true;
      revokeAsset(target);
      const next = current.filter((item) => item.id !== assetId);
      setActiveBackdropId((selected) =>
        selected === assetId ? next[0]?.id ?? null : selected,
      );
      return next;
    });
    if (didRemove) {
      setStatus("Backdrop removed.");
    }
  }

  function removeSubject(assetId: string): void {
    let didRemove = false;
    setSubjects((current) => {
      const target = current.find((item) => item.id === assetId);
      if (!target) {
        return current;
      }
      didRemove = true;
      revokeAsset(target);
      const next = current.filter((item) => item.id !== assetId);
      setActiveSubjectId((selected) =>
        selected === assetId ? next[0]?.id ?? null : selected,
      );
      return next;
    });
    if (didRemove) {
      setStatus("Subject removed.");
    }
  }

  async function addBackdrops(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const { assets, skipped } = await filesToAssets(files);
    if (assets.length === 0) {
      setStatus(skipped[0] ?? "No valid image files found in selection.");
      return;
    }

    registerAssets(assets);
    setBackdrops((current) => [...current, ...assets]);
    setActiveBackdropId((current) => current ?? assets[0]?.id ?? null);

    const suffix = skipped.length > 0 ? ` ${skipped.slice(0, 2).join(" ")}` : "";
    setStatus(`Added ${assets.length} backdrop file(s).${suffix}`);
  }

  async function addSubjects(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const { assets, skipped } = await filesToAssets(files);
    if (assets.length === 0) {
      setStatus(skipped[0] ?? "No valid image files found in selection.");
      return;
    }

    registerAssets(assets);
    setSubjects((current) => [...current, ...assets]);
    setActiveSubjectId((current) => current ?? assets[0]?.id ?? null);

    const suffix = skipped.length > 0 ? ` ${skipped.slice(0, 2).join(" ")}` : "";
    setStatus(`Added ${assets.length} subject file(s).${suffix}`);
  }

  function triggerPicker(
    type: "backdrops" | "subjects",
    mode: "files" | "folder",
  ): void {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.tif,.tiff";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    if (mode === "folder") {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };

    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      void (async () => {
        if (type === "backdrops") {
          await addBackdrops(files);
        } else {
          await addSubjects(files);
        }
        cleanup();
      })();
    };

    input.oncancel = () => {
      cleanup();
      setStatus(mode === "folder" ? "Folder selection cancelled." : "File selection cancelled.");
    };

    document.body.append(input);
    input.click();
  }

  async function pickFolder(type: "backdrops" | "subjects"): Promise<void> {
    const pickerWindow = window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    };

    const handleFiles = async (files: File[]) => {
      if (type === "backdrops") {
        await addBackdrops(files);
      } else {
        await addSubjects(files);
      }
    };

    if (pickerWindow.showDirectoryPicker) {
      try {
        const handle = await pickerWindow.showDirectoryPicker();
        const files = await collectImageFiles(handle);
        await handleFiles(files);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.toLowerCase().includes("abort")) {
          setStatus("Folder selection cancelled.");
          return;
        }
      }
    }

    triggerPicker(type, "folder");
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const xPct = clamp(((clientX - rect.left) / rect.width) * 100, 5, 95);
    const yPct = clamp(((clientY - rect.top) / rect.height) * 100, 25, 96);

    setComposition((current) => ({ ...current, xPct, yPct }));
  }

  function onSubjectPointerDown(event: PointerEvent<HTMLImageElement>): void {
    draggingPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDragPosition(event.clientX, event.clientY);
  }

  function onSubjectPointerMove(event: PointerEvent<HTMLImageElement>): void {
    if (draggingPointerRef.current !== event.pointerId) {
      return;
    }
    updateDragPosition(event.clientX, event.clientY);
  }

  function onSubjectPointerUp(event: PointerEvent<HTMLImageElement>): void {
    if (draggingPointerRef.current !== event.pointerId) {
      return;
    }
    draggingPointerRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function applyAutoPlacementAndBlend(): Promise<void> {
    if (!activeSubject) {
      setStatus("Select a subject first for auto placement.");
      return;
    }

    const analysis = poseAnalysis ?? {
      stanceWidthPct: 34,
      leanPct: 0,
      subjectAspect: 0.52,
    };

    const suggestedHeight = clamp(62 + (0.52 - analysis.subjectAspect) * 26, 48, 82);

    setComposition((current) => ({
      ...current,
      xPct: clamp(50 - analysis.leanPct * 0.22, 8, 92),
      yPct: 85,
      subjectHeightPct: suggestedHeight,
      reflectionEnabled: true,
      reflectionSizePct: 94,
      reflectionOpacityPct: 34,
      reflectionBlurPx: 2,
      shadowEnabled: true,
      shadowStrengthPct: clamp(36 + analysis.stanceWidthPct * 0.25, 20, 76),
      shadowStretchPct: clamp(88 + analysis.stanceWidthPct * 0.45, 65, 170),
      shadowBlurPx: 12,
      fogEnabled: false,
    }));

    setStatus("Auto placement + blend applied.");
  }

  async function autoSetLightDirection(): Promise<void> {
    if (!activeBackdrop) {
      setStatus("Select a backdrop first to auto-calculate light direction.");
      return;
    }

    setIsAutoTuning(true);
    try {
      const direction = await detectBackdropLightDirection(
        activeBackdrop.objectUrl,
        composition.xPct,
        composition.yPct,
      );
      setComposition((current) => ({
        ...current,
        lightDirectionDeg: direction,
        lightElevationDeg: clamp(
          38 + ((poseAnalysis?.stanceWidthPct ?? 34) - 34) * 0.2,
          20,
          62,
        ),
      }));
      setStatus("Shadow direction auto-calculated from scene lighting.");
    } catch {
      setStatus("Could not auto-calculate light direction from this backdrop.");
    } finally {
      setIsAutoTuning(false);
    }
  }

  function applyBlendPreset(preset: "soft" | "studio" | "dramatic"): void {
    if (preset === "soft") {
      setComposition((current) => ({
        ...current,
        reflectionEnabled: true,
        reflectionSizePct: 88,
        reflectionOpacityPct: 26,
        reflectionBlurPx: 3,
        fogEnabled: true,
        fogOpacityPct: 18,
        fogHeightPct: 24,
        shadowEnabled: true,
        shadowStrengthPct: 28,
        shadowStretchPct: 90,
        shadowBlurPx: 14,
      }));
      setStatus("Soft blend preset applied.");
      return;
    }

    if (preset === "studio") {
      setComposition((current) => ({
        ...current,
        reflectionEnabled: true,
        reflectionSizePct: 100,
        reflectionOpacityPct: 36,
        reflectionBlurPx: 2,
        fogEnabled: false,
        shadowEnabled: true,
        shadowStrengthPct: 44,
        shadowStretchPct: 100,
        shadowBlurPx: 12,
      }));
      setStatus("Studio blend preset applied.");
      return;
    }

    setComposition((current) => ({
      ...current,
      reflectionEnabled: true,
      reflectionSizePct: 116,
      reflectionOpacityPct: 44,
      reflectionBlurPx: 5,
      fogEnabled: true,
      fogOpacityPct: 34,
      fogHeightPct: 31,
      shadowEnabled: true,
      shadowStrengthPct: 56,
      shadowStretchPct: 132,
      shadowBlurPx: 16,
    }));
    setStatus("Dramatic blend preset applied.");
  }

  async function onExport(): Promise<void> {
    if (!activeBackdrop || !activeSubject) {
      setStatus("Pick one backdrop and one subject before export.");
      return;
    }

    setIsExporting(true);
    setStatus("Preparing export payload...");

    try {
      const optimized = await prepareExportPayload(
        activeBackdrop,
        activeSubject,
        exportProfileId,
      );

      if (optimized.totalBytes > 4_200_000) {
        throw new Error(
          "Images are still too large for cloud export. Choose a smaller profile or lower source resolution.",
        );
      }

      const formData = new FormData();
      formData.append("backdrop", optimized.backdropBlob, "backdrop.jpg");
      formData.append("subject", optimized.subjectBlob, "subject.webp");
      formData.append("composition", JSON.stringify(composition));
      formData.append("firstName", firstName);
      formData.append("lastName", lastName);
      formData.append("exportProfile", exportProfileId);
      formData.append("nameStyle", nameStyle);

      setStatus("Rendering final image...");
      const response = await fetch("/api/export", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(parseErrorText(responseText));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeFirst = firstName.trim().replace(/\s+/g, "_");
      const safeLast = lastName.trim().replace(/\s+/g, "_");
      const namePart = [safeLast, safeFirst].filter(Boolean).join("_");
      const profilePart = exportProfileId === "original" ? "" : `_${exportProfileId}`;

      anchor.href = url;
      anchor.download = namePart
        ? `${namePart}${profilePart}_compomate.png`
        : `compomate${profilePart}_export.png`;

      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus("Export complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      setStatus(message);
    } finally {
      setIsExporting(false);
    }
  }

  function queuePair(backdrop: Asset, subject: Asset): void {
    const id = makeId();
    const label = `${backdrop.name} + ${subject.name}`;

    setBatchItems((current) => [
      ...current,
      {
        id,
        label,
        backdropId: backdrop.id,
        subjectId: subject.id,
        firstName,
        lastName,
        composition: { ...composition },
        exportProfile: exportProfileId,
        nameStyle,
        status: "pending",
      },
    ]);
  }

  function queueCurrentPair(): void {
    if (!activeBackdrop || !activeSubject) {
      setStatus("Select an active backdrop and subject to queue a batch item.");
      return;
    }
    queuePair(activeBackdrop, activeSubject);
    setStatus("Queued current pair.");
  }

  function queueSubjectAcrossBackdrops(): void {
    if (!activeSubject || backdrops.length === 0) {
      setStatus("Need one active subject and at least one backdrop.");
      return;
    }
    for (const backdrop of backdrops) {
      queuePair(backdrop, activeSubject);
    }
    setStatus(`Queued ${backdrops.length} item(s) for active subject.`);
  }

  function queueAllSubjectsOnBackdrop(): void {
    if (!activeBackdrop || subjects.length === 0) {
      setStatus("Need one active backdrop and at least one subject.");
      return;
    }
    for (const subject of subjects) {
      queuePair(activeBackdrop, subject);
    }
    setStatus(`Queued ${subjects.length} item(s) for active backdrop.`);
  }

  async function runBatchExport(): Promise<void> {
    if (isBatchRunning) {
      return;
    }

    const queueSnapshot = batchItems.filter(
      (item) => item.status === "pending" || item.status === "failed",
    );
    if (queueSnapshot.length === 0) {
      setStatus("Batch queue has no pending items.");
      return;
    }

    batchAbortRef.current = false;
    setIsBatchRunning(true);

    const zip = new JSZip();
    let exportedCount = 0;

    try {
      for (const item of queueSnapshot) {
        if (batchAbortRef.current) {
          setBatchItems((current) =>
            current.map((entry) =>
              entry.status === "running" || entry.status === "pending"
                ? { ...entry, status: "cancelled", error: "Cancelled by user." }
                : entry,
            ),
          );
          setStatus("Batch run cancelled.");
          break;
        }

        setBatchItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "running", error: undefined } : entry,
          ),
        );

        const backdrop = backdrops.find((asset) => asset.id === item.backdropId);
        const subject = subjects.find((asset) => asset.id === item.subjectId);
        if (!backdrop || !subject) {
          setBatchItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "failed", error: "Source asset missing." }
                : entry,
            ),
          );
          continue;
        }

        try {
          const optimized = await prepareExportPayload(
            backdrop,
            subject,
            item.exportProfile,
          );
          if (optimized.totalBytes > 4_200_000) {
            throw new Error(
              "Item too large for cloud export. Use smaller source files or export profile.",
            );
          }

          const formData = new FormData();
          formData.append("backdrop", optimized.backdropBlob, "backdrop.jpg");
          formData.append("subject", optimized.subjectBlob, "subject.webp");
          formData.append("composition", JSON.stringify(item.composition));
          formData.append("firstName", item.firstName);
          formData.append("lastName", item.lastName);
          formData.append("exportProfile", item.exportProfile);
          formData.append("nameStyle", item.nameStyle);

          const response = await fetch("/api/export", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const message = parseErrorText(await response.text());
            throw new Error(message);
          }

          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const safeLabel = item.label
            .replace(/\.[a-z0-9]+$/i, "")
            .replace(/[^a-z0-9_-]+/gi, "_")
            .slice(0, 64);
          zip.file(`${safeLabel || item.id}.png`, arrayBuffer);

          exportedCount += 1;
          setBatchItems((current) =>
            current.map((entry) =>
              entry.id === item.id ? { ...entry, status: "done", error: undefined } : entry,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Batch export failed.";
          setBatchItems((current) =>
            current.map((entry) =>
              entry.id === item.id ? { ...entry, status: "failed", error: message } : entry,
            ),
          );
        }
      }

      if (exportedCount > 0) {
        const bundle = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(bundle);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `compomate_batch_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }

      if (!batchAbortRef.current) {
        setStatus(`Batch complete: ${exportedCount} file(s) exported.`);
      }
    } finally {
      setIsBatchRunning(false);
      batchAbortRef.current = false;
    }
  }

  async function generateBackdropWithFal(): Promise<void> {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      setStatus("Enter a prompt before generating a backdrop.");
      return;
    }

    setIsGeneratingBackdrop(true);
    setStatus("Generating backdrop with fal...");

    try {
      const response = await fetch("/api/generate-backdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          styleHint: generateStyleHint,
          aspectMode: generateAspectMode,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(parseErrorText(text));
      }

      const payload = (await response.json()) as unknown;
      let completed: FalBackdropCompletedPayload | null = null;

      if (isFalBackdropCompletedPayload(payload)) {
        completed = payload;
      } else if (isFalBackdropPendingPayload(payload)) {
        let latest = payload;
        const positionText =
          latest.queuePosition === null ? "" : ` (queue ${latest.queuePosition})`;
        setStatus(`Backdrop queued on fal${positionText}. Waiting for completion...`);

        for (let attempt = 0; attempt < BACKDROP_MAX_POLLS; attempt += 1) {
          await wait(BACKDROP_POLL_INTERVAL_MS);

          const query = new URLSearchParams({
            statusUrl: latest.statusUrl,
            responseUrl: latest.responseUrl,
          });
          const pollResponse = await fetch(`/api/generate-backdrop?${query.toString()}`, {
            cache: "no-store",
          });

          if (!pollResponse.ok) {
            const text = await pollResponse.text();
            throw new Error(parseErrorText(text));
          }

          const polledPayload = (await pollResponse.json()) as unknown;
          if (isFalBackdropCompletedPayload(polledPayload)) {
            completed = polledPayload;
            break;
          }
          if (!isFalBackdropPendingPayload(polledPayload)) {
            throw new Error("Unexpected fal polling response.");
          }

          latest = polledPayload;
          const queueText =
            latest.queuePosition === null ? "" : ` Queue ${latest.queuePosition}.`;
          setStatus(`Waiting for fal generation...${queueText}`);
        }
      } else {
        throw new Error("Unexpected response from backdrop generation.");
      }

      if (!completed?.dataUrl) {
        throw new Error(
          "Backdrop is still queued on fal. Try again in a moment to continue polling.",
        );
      }

      const asset = await dataUrlToAsset(
        `fal_${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
        completed.dataUrl,
      );
      registerAssets([asset]);
      setBackdrops((current) => [asset, ...current]);
      setActiveBackdropId(asset.id);
      setStatus("Generated backdrop added to library.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backdrop generation failed.";
      setStatus(message);
    } finally {
      setIsGeneratingBackdrop(false);
    }
  }

  function buildSnapshot(): ProjectSnapshot {
    return {
      version: 1,
      firstName,
      lastName,
      nameStyle,
      exportProfile: exportProfileId,
      composition,
      activeBackdrop: activeBackdrop
        ? { name: activeBackdrop.name, dataUrl: activeBackdrop.dataUrl }
        : null,
      activeSubject: activeSubject
        ? { name: activeSubject.name, dataUrl: activeSubject.dataUrl }
        : null,
    };
  }

  async function saveProject(): Promise<void> {
    if (supabaseConfigured === false) {
      setStatus("Supabase is not configured for persistence in this environment.");
      return;
    }

    const name = projectName.trim();
    if (!name) {
      setStatus("Enter a project name before saving.");
      return;
    }

    setIsSavingProject(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, snapshot: buildSnapshot() }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(parseErrorText(text));
      }

      setStatus("Project saved to Supabase.");
      await refreshProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project save failed.";
      setStatus(message);
    } finally {
      setIsSavingProject(false);
    }
  }

  async function refreshProjects(): Promise<void> {
    setIsLoadingProjects(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(parseErrorText(text));
      }
      const payload = (await response.json()) as {
        projects?: StoredProjectSummary[];
        configured?: boolean;
      };
      setSavedProjects(payload.projects ?? []);
      const configured = payload.configured !== false;
      setSupabaseConfigured(configured);
      if (!configured) {
        setStatus("Supabase not configured. Project save/load is disabled.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load projects.";
      setStatus(message);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadProject(projectId: string): Promise<void> {
    if (supabaseConfigured === false) {
      setStatus("Supabase is not configured for persistence in this environment.");
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(parseErrorText(text));
      }

      const payload = (await response.json()) as {
        project?: { payload?: unknown; name?: string };
      };
      const snapshot = payload.project?.payload;
      if (!isProjectSnapshot(snapshot)) {
        throw new Error("Stored project payload format is invalid.");
      }

      const nextBackdrop = snapshot.activeBackdrop
        ? await dataUrlToAsset(snapshot.activeBackdrop.name, snapshot.activeBackdrop.dataUrl)
        : null;
      const nextSubject = snapshot.activeSubject
        ? await dataUrlToAsset(snapshot.activeSubject.name, snapshot.activeSubject.dataUrl)
        : null;

      if (nextBackdrop) {
        registerAssets([nextBackdrop]);
      }
      if (nextSubject) {
        registerAssets([nextSubject]);
      }

      setBackdrops((current) => {
        current.forEach((asset) => revokeAsset(asset));
        return nextBackdrop ? [nextBackdrop] : [];
      });
      setSubjects((current) => {
        current.forEach((asset) => revokeAsset(asset));
        return nextSubject ? [nextSubject] : [];
      });

      setActiveBackdropId(nextBackdrop?.id ?? null);
      setActiveSubjectId(nextSubject?.id ?? null);
      setFirstName(snapshot.firstName);
      setLastName(snapshot.lastName);
      setNameStyle(snapshot.nameStyle);
      setExportProfileId(snapshot.exportProfile);
      setComposition(snapshot.composition);
      setProjectName(payload.project?.name ?? "Session");
      setStatus("Project loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project load failed.";
      setStatus(message);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--text-primary)]">
      <header className="flex h-14 items-center justify-between border-b border-[color:var(--panel-border)] px-5">
        <div>
          <p className="text-sm font-semibold tracking-wide">CompoMate</p>
          <p className="text-xs text-[var(--text-soft)]">
            Composite production workstation
          </p>
        </div>
        <div className="rounded-md border border-[color:var(--panel-border)] px-2 py-1 text-xs text-[var(--text-soft)]">
          Phases 1-7 Build
        </div>
      </header>

      <main className="grid h-[calc(100vh-56px)] min-h-[780px] grid-cols-[320px_minmax(0,1fr)_360px] gap-4 p-4">
        <aside className="panel overflow-auto space-y-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="panel-title">Backdrops</h2>
              <span className="panel-meta">{backdrops.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => triggerPicker("backdrops", "files")}
              >
                Add Files
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  void pickFolder("backdrops");
                }}
              >
                Add Folder
              </button>
            </div>
            <div className="asset-list">
              {backdrops.map((backdrop) => (
                <div
                  key={backdrop.id}
                  className={`asset-item ${backdrop.id === activeBackdropId ? "asset-item-active" : ""}`}
                >
                  <button
                    className="asset-select"
                    type="button"
                    onClick={() => setActiveBackdropId(backdrop.id)}
                  >
                    <img
                      className="h-12 w-12 rounded object-cover"
                      src={backdrop.objectUrl}
                      alt={backdrop.name}
                    />
                    <span className="truncate">{backdrop.name}</span>
                  </button>
                  <button
                    className="asset-remove"
                    type="button"
                    onClick={() => removeBackdrop(backdrop.id)}
                    aria-label={`Remove ${backdrop.name}`}
                    title={`Remove ${backdrop.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="panel-title">Subjects</h2>
              <span className="panel-meta">{subjects.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => triggerPicker("subjects", "files")}
              >
                Add Files
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  void pickFolder("subjects");
                }}
              >
                Add Folder
              </button>
            </div>
            <div className="asset-list">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className={`asset-item ${subject.id === activeSubjectId ? "asset-item-active" : ""}`}
                >
                  <button
                    className="asset-select"
                    type="button"
                    onClick={() => setActiveSubjectId(subject.id)}
                  >
                    <img
                      className="h-12 w-12 rounded object-cover"
                      src={subject.objectUrl}
                      alt={subject.name}
                    />
                    <span className="truncate">{subject.name}</span>
                  </button>
                  <button
                    className="asset-remove"
                    type="button"
                    onClick={() => removeSubject(subject.id)}
                    aria-label={`Remove ${subject.name}`}
                    title={`Remove ${subject.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Generate Backdrop (fal)</h2>
            <textarea
              className="input min-h-20 resize-y"
              placeholder="Describe the backdrop to generate"
              value={generatePrompt}
              onChange={(event) => setGeneratePrompt(event.target.value)}
            />
            <input
              className="input"
              placeholder="Style hint"
              value={generateStyleHint}
              onChange={(event) => setGenerateStyleHint(event.target.value)}
            />
            <select
              className="input"
              value={generateAspectMode}
              onChange={(event) =>
                setGenerateAspectMode(event.target.value as "portrait" | "landscape" | "square")
              }
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
              <option value="square">Square</option>
            </select>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => {
                void generateBackdropWithFal();
              }}
              disabled={isGeneratingBackdrop}
            >
              {isGeneratingBackdrop ? "Generating..." : "Generate Backdrop"}
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Projects (Supabase)</h2>
            <input
              className="input"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  void saveProject();
                }}
                disabled={isSavingProject || supabaseConfigured === false}
              >
                {isSavingProject ? "Saving..." : "Save"}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  void refreshProjects();
                }}
                disabled={isLoadingProjects}
              >
                Refresh
              </button>
            </div>
            <div className="asset-list">
              {supabaseConfigured === false ? (
                <div className="asset-item">
                  <p className="text-[11px] text-[var(--text-soft)]">
                    Configure Supabase env vars to enable project persistence.
                  </p>
                </div>
              ) : null}
              {savedProjects.map((project) => (
                <div key={project.id} className="asset-item">
                  <button
                    className="asset-select"
                    type="button"
                    onClick={() => {
                      void loadProject(project.id);
                    }}
                  >
                    <span className="truncate">{project.name}</span>
                  </button>
                  <span className="text-[10px] text-[var(--text-soft)]">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="panel flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Canvas</h2>
            <p className="max-w-[72%] truncate text-xs text-[var(--text-soft)]" title={status}>
              {status}
            </p>
          </div>

          <div
            ref={canvasRef}
            className="relative flex-1 overflow-hidden rounded-lg border border-[color:var(--panel-border)] bg-[radial-gradient(circle_at_top,_#2a2a39_0%,_#12121a_58%,_#0d0d12_100%)]"
          >
            {activeBackdrop ? (
              <img
                className="h-full w-full select-none object-contain"
                src={activeBackdrop.objectUrl}
                alt={activeBackdrop.name}
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-soft)]">
                Add a backdrop image to start.
              </div>
            )}

            {showSafeArea && activeProfile.aspectRatio ? (
              <div
                className="pointer-events-none absolute border border-dashed border-white/35"
                style={{
                  left: `${safeAreaBox.leftPct}%`,
                  top: `${safeAreaBox.topPct}%`,
                  width: `${safeAreaBox.widthPct}%`,
                  height: `${safeAreaBox.heightPct}%`,
                }}
              />
            ) : null}

            {activeSubject ? (
              <>
                {composition.shadowEnabled ? (
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      left: `${composition.xPct + shadowMetrics.shadowOffsetXPct}%`,
                      top: `${composition.yPct + shadowMetrics.shadowOffsetYPct}%`,
                      width: `${shadowMetrics.shadowWidthPct}%`,
                      height: `${shadowMetrics.shadowHeightPct}%`,
                      opacity: shadowMetrics.shadowOpacity,
                      transform: `translate(-50%, -50%) rotate(${shadowMetrics.shadowAngleDeg}deg)`,
                      background:
                        "radial-gradient(ellipse at center, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.48) 48%, rgba(0,0,0,0) 100%)",
                      filter: `blur(${shadowMetrics.shadowBlurPx}px)`,
                    }}
                  />
                ) : null}

                {composition.reflectionEnabled && composition.reflectionSizePct > 0 ? (
                  <img
                    className="pointer-events-none absolute select-none"
                    src={activeSubject.objectUrl}
                    alt={`${activeSubject.name} reflection`}
                    draggable={false}
                    style={{
                      left: `${composition.xPct}%`,
                      top: `${reflectionTop}%`,
                      height: `${reflectionHeight}%`,
                      opacity: composition.reflectionOpacityPct / 100,
                      filter: `blur(${composition.reflectionBlurPx}px)`,
                      transform: "translate(-50%, 0) scaleY(-1)",
                      maskImage:
                        "linear-gradient(to bottom, rgba(0, 0, 0, 0.75), transparent)",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, rgba(0, 0, 0, 0.75), transparent)",
                    }}
                  />
                ) : null}

                <img
                  className="absolute cursor-grab select-none active:cursor-grabbing"
                  src={activeSubject.objectUrl}
                  alt={activeSubject.name}
                  draggable={false}
                  onPointerDown={onSubjectPointerDown}
                  onPointerMove={onSubjectPointerMove}
                  onPointerUp={onSubjectPointerUp}
                  onPointerCancel={onSubjectPointerUp}
                  style={{
                    left: `${composition.xPct}%`,
                    top: `${composition.yPct}%`,
                    height: `${composition.subjectHeightPct}%`,
                    transform: "translate(-50%, -100%)",
                    maskImage: subjectFadeMask,
                    WebkitMaskImage: subjectFadeMask,
                  }}
                />

                {composition.fogEnabled ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0"
                    style={{
                      height: `${composition.fogHeightPct}%`,
                      background: `linear-gradient(to top, rgba(234, 238, 255, ${fogOpacity.toFixed(3)}), rgba(234, 238, 255, 0))`,
                      filter: "blur(8px)",
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <aside className="panel overflow-auto space-y-4">
          <section className="space-y-3">
            <h2 className="panel-title">Auto Assist</h2>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => {
                void applyAutoPlacementAndBlend();
              }}
            >
              Auto Place + Blend
            </button>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => {
                void autoSetLightDirection();
              }}
              disabled={isAutoTuning}
            >
              {isAutoTuning ? "Analyzing light..." : "Auto Shadow Direction"}
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-secondary" type="button" onClick={() => applyBlendPreset("soft")}>Soft</button>
              <button className="btn-secondary" type="button" onClick={() => applyBlendPreset("studio")}>Studio</button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => applyBlendPreset("dramatic")}
              >
                Dramatic
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Placement</h2>
            <SliderControl
              label="X position"
              value={composition.xPct}
              min={5}
              max={95}
              step={1}
              suffix="%"
              onChange={(value) =>
                setComposition((current) => ({ ...current, xPct: value }))
              }
            />
            <SliderControl
              label="Y baseline"
              value={composition.yPct}
              min={25}
              max={96}
              step={1}
              suffix="%"
              onChange={(value) =>
                setComposition((current) => ({ ...current, yPct: value }))
              }
            />
            <SliderControl
              label="Subject height"
              value={composition.subjectHeightPct}
              min={20}
              max={95}
              step={1}
              suffix="%"
              onChange={(value) =>
                setComposition((current) => ({ ...current, subjectHeightPct: value }))
              }
            />
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Shadow</h2>
            <ToggleControl
              label="Enable shadow"
              checked={composition.shadowEnabled}
              onChange={(checked) =>
                setComposition((current) => ({ ...current, shadowEnabled: checked }))
              }
            />
            {composition.shadowEnabled ? (
              <>
                <SliderControl
                  label="Shadow strength"
                  value={composition.shadowStrengthPct}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, shadowStrengthPct: value }))
                  }
                />
                <SliderControl
                  label="Light direction"
                  value={composition.lightDirectionDeg}
                  min={0}
                  max={359}
                  step={1}
                  suffix="deg"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, lightDirectionDeg: value }))
                  }
                />
                <SliderControl
                  label="Light elevation"
                  value={composition.lightElevationDeg}
                  min={5}
                  max={85}
                  step={1}
                  suffix="deg"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, lightElevationDeg: value }))
                  }
                />
                <SliderControl
                  label="Shadow stretch"
                  value={composition.shadowStretchPct}
                  min={35}
                  max={250}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, shadowStretchPct: value }))
                  }
                />
                <SliderControl
                  label="Shadow blur"
                  value={composition.shadowBlurPx}
                  min={0}
                  max={40}
                  step={1}
                  suffix="px"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, shadowBlurPx: value }))
                  }
                />
              </>
            ) : (
              <p className="text-xs text-[var(--text-soft)]">Shadow is disabled.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Reflection</h2>
            <ToggleControl
              label="Enable reflection"
              checked={composition.reflectionEnabled}
              onChange={(checked) =>
                setComposition((current) => ({ ...current, reflectionEnabled: checked }))
              }
            />
            {composition.reflectionEnabled ? (
              <>
                <SliderControl
                  label="Length"
                  value={composition.reflectionSizePct}
                  min={0}
                  max={200}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, reflectionSizePct: value }))
                  }
                />
                <SliderControl
                  label="Height"
                  value={composition.reflectionPositionPct}
                  min={70}
                  max={130}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, reflectionPositionPct: value }))
                  }
                />
                <SliderControl
                  label="Opacity"
                  value={composition.reflectionOpacityPct}
                  min={0}
                  max={90}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, reflectionOpacityPct: value }))
                  }
                />
                <SliderControl
                  label="Blur"
                  value={composition.reflectionBlurPx}
                  min={0}
                  max={20}
                  step={1}
                  suffix="px"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, reflectionBlurPx: value }))
                  }
                />
              </>
            ) : (
              <p className="text-xs text-[var(--text-soft)]">Reflection is hidden.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Blend Helpers</h2>
            <ToggleControl
              label="Leg gradient fade"
              checked={composition.legFadeEnabled}
              onChange={(checked) =>
                setComposition((current) => ({ ...current, legFadeEnabled: checked }))
              }
            />
            {composition.legFadeEnabled ? (
              <SliderControl
                label="Fade start"
                value={composition.legFadeStartPct}
                min={45}
                max={95}
                step={1}
                suffix="%"
                onChange={(value) =>
                  setComposition((current) => ({ ...current, legFadeStartPct: value }))
                }
              />
            ) : null}

            <ToggleControl
              label="Floor fog blend"
              checked={composition.fogEnabled}
              onChange={(checked) =>
                setComposition((current) => ({ ...current, fogEnabled: checked }))
              }
            />
            {composition.fogEnabled ? (
              <>
                <SliderControl
                  label="Fog opacity"
                  value={composition.fogOpacityPct}
                  min={5}
                  max={95}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, fogOpacityPct: value }))
                  }
                />
                <SliderControl
                  label="Fog height"
                  value={composition.fogHeightPct}
                  min={8}
                  max={60}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    setComposition((current) => ({ ...current, fogHeightPct: value }))
                  }
                />
              </>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="panel-title">Export</h2>
            <div className="space-y-2">
              <input
                className="input"
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
              <input
                className="input"
                placeholder="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <label className="space-y-2 text-xs text-[var(--text-soft)]">
              <span>Name style</span>
              <select
                className="input"
                value={nameStyle}
                onChange={(event) => setNameStyle(event.target.value as NameStyleId)}
              >
                {NAME_STYLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs text-[var(--text-soft)]">
              <span>Export profile</span>
              <select
                className="input"
                value={exportProfileId}
                onChange={(event) => setExportProfileId(event.target.value as ExportProfileId)}
              >
                {Object.values(EXPORT_PROFILES).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <ToggleControl
              label="Show safe area overlay"
              checked={showSafeArea}
              onChange={setShowSafeArea}
            />
            <p className="text-xs text-[var(--text-soft)]">{activeProfile.description}</p>
            <button
              className="btn-primary w-full"
              type="button"
              onClick={() => {
                void onExport();
              }}
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export Final PNG"}
            </button>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="panel-title">Batch Queue</h2>
              <span className="panel-meta">{batchItems.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-secondary" type="button" onClick={queueCurrentPair}>
                Queue Pair
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={queueSubjectAcrossBackdrops}
              >
                Subject x All
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={queueAllSubjectsOnBackdrop}
              >
                Backdrop x All
              </button>
            </div>
            <div className="asset-list max-h-44">
              {batchItems.map((item) => (
                <div key={item.id} className="asset-item">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px]">{item.label}</p>
                    <p className="text-[10px] text-[var(--text-soft)]">
                      {item.status}
                      {item.error ? ` - ${item.error}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  void runBatchExport();
                }}
                disabled={isBatchRunning || batchItems.length === 0}
              >
                {isBatchRunning ? "Running..." : "Run Batch"}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  if (isBatchRunning) {
                    batchAbortRef.current = true;
                    return;
                  }
                  setBatchItems([]);
                  setStatus("Batch queue cleared.");
                }}
              >
                {isBatchRunning ? "Cancel" : "Clear"}
              </button>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
