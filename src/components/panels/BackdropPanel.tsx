/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useBackdrops, useGeneration } from '@/lib/store/selectors';
import {
  filesToBackdropAssets,
  collectImageFiles,
  dataUrlToAsset,
  dataUrlToBackdropAsset,
  parseErrorText,
  wait,
  isProjectSnapshot,
  fileToDataUrl,
  r2KeyToAsset,
  r2KeyToBackdropAsset,
} from '@/lib/client/utils';
import { uploadBlobToR2 } from '@/lib/client/uploader';
import {
  BACKDROP_POLL_INTERVAL_MS,
  BACKDROP_MAX_POLLS,
  BACKDROP_DEFAULT_STYLE_HINT,
  PROJECT_SNAPSHOT_VERSION,
} from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type {
  FalBackdropPendingPayload,
  FalBackdropCompletedPayload,
} from '@/types/export';
import { isFalPending, isFalCompleted } from '@/types/export';
import type { SerializedAsset, StoredProjectSummary } from '@/lib/shared/project-snapshot';

// ---------------------------------------------------------------------------
// Local type guards for fal payloads
// ---------------------------------------------------------------------------

function isFalPayload(value: unknown): value is FalBackdropPendingPayload | FalBackdropCompletedPayload {
  return !!value && typeof value === 'object' && 'pending' in (value as object);
}

// ---------------------------------------------------------------------------
// Ideogram style options
// ---------------------------------------------------------------------------

const IDEOGRAM_STYLES = [
  { value: 'REALISTIC', label: 'Realistic' },
  { value: 'DESIGN', label: 'Design' },
  { value: 'RENDER_3D', label: 'Render 3D' },
  { value: 'ANIME', label: 'Anime' },
] as const;

type IdeogramStyleValue = (typeof IDEOGRAM_STYLES)[number]['value'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackdropPanel() {
  const backdrops = useBackdrops();
  const activeBackdropId = useStore((s) => s.activeBackdropId);
  const generation = useGeneration();
  const addBackdrop = useStore((s) => s.addBackdrop);
  const replaceBackdrops = useStore((s) => s.replaceBackdrops);
  const removeBackdrop = useStore((s) => s.removeBackdrop);
  const updateBackdrop = useStore((s) => s.updateBackdrop);
  const setActiveBackdrop = useStore((s) => s.setActiveBackdrop);
  const setGeneration = useStore((s) => s.setGeneration);
  const resetGeneration = useStore((s) => s.resetGeneration);
  const showToast = useStore((s) => s.showToast);

  const objectUrlsRef = useRef(new Set<string>());

  // ----- Upload tab state -----
  const [isDragOver, setIsDragOver] = useState(false);

  // ----- AI Generate tab state -----
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateStyleHint, setGenerateStyleHint] = useState(BACKDROP_DEFAULT_STYLE_HINT);
  const [generateAspectMode, setGenerateAspectMode] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [ideogramStyle, setIdeogramStyle] = useState<IdeogramStyleValue>('REALISTIC');
  const [isGeneratingFlux, setIsGeneratingFlux] = useState(false);
  const [isGeneratingIdeogram, setIsGeneratingIdeogram] = useState(false);

  // ----- Reference Photo tab state -----
  const [refPhotoDataUrl, setRefPhotoDataUrl] = useState<string | null>(null);
  const [refPhotoName, setRefPhotoName] = useState<string>('');
  const [isAnalyzingRef, setIsAnalyzingRef] = useState(false);
  const [refGeneratedPrompt, setRefGeneratedPrompt] = useState('');
  const [isGeneratingFromRef, setIsGeneratingFromRef] = useState(false);

  // ----- Projects (Supabase) state (unchanged) -----
  const [projectName, setProjectName] = useState('Session');
  const [savedProjects, setSavedProjects] = useState<StoredProjectSummary[]>([]);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | null>(null);
  const [projectPersistenceReason, setProjectPersistenceReason] = useState<string | null>(null);

  // ----- Store selectors for snapshot -----
  const firstName = useStore((s) => s.firstName);
  const lastName = useStore((s) => s.lastName);
  const nameStyleId = useStore((s) => s.nameStyleId);
  const exportProfileId = useStore((s) => s.exportProfileId);
  const composition = useStore((s) => s.composition);
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const subjects = useStore((s) => s.subjects);
  const setFirstName = useStore((s) => s.setFirstName);
  const setLastName = useStore((s) => s.setLastName);
  const setNameStyle = useStore((s) => s.setNameStyle);
  const setExportProfile = useStore((s) => s.setExportProfile);
  const updateComposition = useStore((s) => s.updateComposition);
  const replaceSubjects = useStore((s) => s.replaceSubjects);
  const setActiveSubject = useStore((s) => s.setActiveSubject);
  const clearBatch = useStore((s) => s.clearBatch);

  function registerUrl(url: string) { objectUrlsRef.current.add(url); }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  async function handleBackdropFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const { assets, skipped } = await filesToBackdropAssets(files);
    if (assets.length === 0) { showToast(skipped[0] ?? 'No valid image files found.'); return; }

    for (const asset of assets) {
      registerUrl(asset.objectUrl);
      addBackdrop(asset);
    }
    if (!activeBackdropId && assets.length > 0) setActiveBackdrop(assets[0].id);

    const suffix = skipped.length > 0 ? ` ${skipped.slice(0, 2).join(' ')}` : '';
    showToast(`Added ${assets.length} backdrop file(s).${suffix}`);

    // Upload to R2 in background (non-blocking)
    for (let i = 0; i < files.length && i < assets.length; i++) {
      const file = files[i];
      const asset = assets[i];
      if (!file || !asset) continue;
      uploadBlobToR2(file, file.name, 'backdrop')
        .then(({ key }) => { updateBackdrop(asset.id, { r2Key: key }); })
        .catch(() => { /* R2 upload failure is non-critical */ });
    }
  }

  function triggerFilePicker(mode: 'files' | 'folder'): void {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'image/*,.tif,.tiff';
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    if (mode === 'folder') { input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', ''); }
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; input.onchange = null; input.oncancel = null; input.remove(); };
    input.onchange = () => { const files = input.files ? Array.from(input.files) : []; void handleBackdropFiles(files).then(cleanup); };
    input.oncancel = () => { cleanup(); showToast('Selection cancelled.'); };
    document.body.append(input); input.click();
  }

  async function pickFolder(): Promise<void> {
    const win = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (win.showDirectoryPicker) {
      try {
        const handle = await win.showDirectoryPicker();
        const files = await collectImageFiles(handle);
        await handleBackdropFiles(files); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.toLowerCase().includes('abort')) { showToast('Folder selection cancelled.'); return; }
      }
    }
    triggerFilePicker('folder');
  }

  function handleRemove(id: string): void {
    const backdrop = backdrops.find((b) => b.id === id);
    if (backdrop && objectUrlsRef.current.has(backdrop.objectUrl)) {
      URL.revokeObjectURL(backdrop.objectUrl);
      objectUrlsRef.current.delete(backdrop.objectUrl);
    }
    removeBackdrop(id);
    showToast('Backdrop removed.');
  }

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent): void {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    void handleBackdropFiles(files);
  }

  // ---------------------------------------------------------------------------
  // Shared fal.ai generation helper
  // ---------------------------------------------------------------------------

  async function runFalGeneration(
    body: Record<string, unknown>,
    filenamePrefix: string,
    setGenerating: (v: boolean) => void,
  ): Promise<void> {
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) { showToast('Enter a prompt before generating.'); return; }

    setGenerating(true);
    resetGeneration();
    setGeneration({ status: 'generating', prompt });
    showToast('Generating backdrop…');

    try {
      const response = await fetch('/api/generate-backdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) { const text = await response.text(); throw new Error(parseErrorText(text)); }

      const payload = (await response.json()) as unknown;
      if (!isFalPayload(payload)) throw new Error('Unexpected response from backdrop generation.');

      let completed: FalBackdropCompletedPayload | null = null;

      if (isFalCompleted(payload)) {
        completed = payload;
      } else if (isFalPending(payload)) {
        let latest = payload;
        setGeneration({ status: 'polling', queuePosition: latest.queuePosition ?? undefined });
        showToast(`Backdrop queued${latest.queuePosition != null ? ` (queue ${latest.queuePosition})` : ''}. Waiting…`);

        const modelParam = encodeURIComponent(latest.model ?? '');
        for (let attempt = 0; attempt < BACKDROP_MAX_POLLS; attempt++) {
          await wait(BACKDROP_POLL_INTERVAL_MS);
          const query = new URLSearchParams({ statusUrl: latest.statusUrl, responseUrl: latest.responseUrl, model: modelParam });
          const pollResponse = await fetch(`/api/generate-backdrop?${query}`, { cache: 'no-store' });
          if (!pollResponse.ok) { const text = await pollResponse.text(); throw new Error(parseErrorText(text)); }
          const polled = (await pollResponse.json()) as unknown;
          if (!isFalPayload(polled)) throw new Error('Unexpected fal polling response.');
          if (isFalCompleted(polled)) { completed = polled; break; }
          if (isFalPending(polled)) {
            latest = polled;
            setGeneration({ queuePosition: latest.queuePosition ?? undefined });
          }
        }
      }

      if (!completed?.dataUrl) throw new Error('Backdrop still queued. Try again in a moment.');

      const asset = await dataUrlToBackdropAsset(
        `${filenamePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        completed.dataUrl,
        prompt,
      );
      registerUrl(asset.objectUrl);
      addBackdrop(asset);
      setActiveBackdrop(asset.id);
      setGeneration({ status: 'done' });
      showToast('Generated backdrop added to library.');

      // Upload to R2 in background
      const blob = await fetch(asset.objectUrl).then((r) => r.blob());
      uploadBlobToR2(blob, asset.name, 'backdrop')
        .then(({ key }) => { updateBackdrop(asset.id, { r2Key: key }); })
        .catch(() => { /* non-critical */ });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backdrop generation failed.';
      setGeneration({ status: 'error', error: message });
      showToast(message);
    } finally {
      setGenerating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Reference Photo analysis
  // ---------------------------------------------------------------------------

  function handleRefPhotoSelect(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        setRefPhotoDataUrl(dataUrl);
        setRefPhotoName(file.name);
      } catch {
        showToast('Failed to read reference photo.');
      }
    };
    document.body.append(input); input.click();
  }

  async function analyzeReferencePhoto(): Promise<void> {
    if (!refPhotoDataUrl) { showToast('Upload a reference photo first.'); return; }
    setIsAnalyzingRef(true);
    try {
      const res = await fetch('/api/analyze-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: refPhotoDataUrl }),
      });
      if (!res.ok) { const text = await res.text(); throw new Error(parseErrorText(text)); }
      const { prompt } = (await res.json()) as { prompt: string };
      setRefGeneratedPrompt(prompt);
      showToast('Backdrop prompt generated from reference photo.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Reference analysis failed.');
    } finally {
      setIsAnalyzingRef(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Projects (Supabase) — unchanged from original
  // ---------------------------------------------------------------------------

  const activeBackdrop = backdrops.find((b) => b.id === activeBackdropId) ?? null;
  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;

  async function serializeAsset(
    asset: { name: string; objectUrl: string; r2Key?: string } | null,
    fallbackFile?: File,
  ): Promise<SerializedAsset | null> {
    if (!asset) return null;
    if (asset.r2Key) {
      return { name: asset.name, r2Key: asset.r2Key };
    }

    if (fallbackFile) {
      return {
        name: asset.name,
        dataUrl: await fileToDataUrl(fallbackFile),
      };
    }

    const response = await fetch(asset.objectUrl);
    const blob = await response.blob();
    const file = new File([blob], asset.name, { type: blob.type });
    return {
      name: asset.name,
      dataUrl: await fileToDataUrl(file),
    };
  }

  async function buildSnapshot() {
    const [serializedBackdrop, serializedSubject] = await Promise.all([
      serializeAsset(activeBackdrop),
      serializeAsset(activeSubject, activeSubject?.file),
    ]);
    return {
      version: PROJECT_SNAPSHOT_VERSION,
      firstName,
      lastName,
      nameStyle: nameStyleId,
      exportProfile: exportProfileId,
      composition, activeBackdrop: serializedBackdrop, activeSubject: serializedSubject,
    };
  }

  async function refreshProjects(): Promise<void> {
    setIsLoadingProjects(true);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      if (!response.ok) { const text = await response.text(); throw new Error(parseErrorText(text)); }
      const payload = (await response.json()) as { projects?: StoredProjectSummary[]; configured?: boolean; reason?: string };
      setSavedProjects(payload.projects ?? []);
      setSupabaseConfigured(payload.configured !== false);
      setProjectPersistenceReason(payload.reason ?? null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to load projects.');
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function saveProject(): Promise<void> {
    if (supabaseConfigured === false) { showToast(projectPersistenceReason ?? 'Remote persistence unavailable.'); return; }
    const name = projectName.trim();
    if (!name) { showToast('Enter a project name before saving.'); return; }
    setIsSavingProject(true);
    try {
      const snapshot = await buildSnapshot();
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, snapshot }),
      });
      if (!response.ok) { const text = await response.text(); throw new Error(parseErrorText(text)); }
      showToast('Project saved to Supabase.');
      await refreshProjects();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Project save failed.');
    } finally {
      setIsSavingProject(false);
    }
  }

  async function loadProject(projectId: string): Promise<void> {
    if (supabaseConfigured === false) { showToast(projectPersistenceReason ?? 'Remote persistence unavailable.'); return; }
    try {
      const response = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
      if (!response.ok) { const text = await response.text(); throw new Error(parseErrorText(text)); }
      const payload = (await response.json()) as { project?: { payload?: unknown; name?: string } };
      const snapshot = payload.project?.payload;
      if (!isProjectSnapshot(snapshot)) throw new Error('Stored project payload format is invalid.');

      const nextBackdrop = snapshot.activeBackdrop
        ? snapshot.activeBackdrop.r2Key
          ? await r2KeyToBackdropAsset(snapshot.activeBackdrop.name, snapshot.activeBackdrop.r2Key)
          : snapshot.activeBackdrop.dataUrl
            ? await dataUrlToBackdropAsset(snapshot.activeBackdrop.name, snapshot.activeBackdrop.dataUrl)
            : null
        : null;
      const nextSubject = snapshot.activeSubject
        ? snapshot.activeSubject.r2Key
          ? await r2KeyToAsset(snapshot.activeSubject.name, snapshot.activeSubject.r2Key)
          : snapshot.activeSubject.dataUrl
            ? await dataUrlToAsset(snapshot.activeSubject.name, snapshot.activeSubject.dataUrl)
            : null
        : null;

      for (const b of backdrops) { if (objectUrlsRef.current.has(b.objectUrl)) { URL.revokeObjectURL(b.objectUrl); objectUrlsRef.current.delete(b.objectUrl); } }
      for (const s of subjects) { if (objectUrlsRef.current.has(s.objectUrl)) { URL.revokeObjectURL(s.objectUrl); objectUrlsRef.current.delete(s.objectUrl); } }

      if (nextBackdrop) registerUrl(nextBackdrop.objectUrl);
      if (nextSubject) registerUrl(nextSubject.objectUrl);

      replaceBackdrops(nextBackdrop ? [nextBackdrop] : []);
      replaceSubjects(nextSubject ? [nextSubject] : []);
      setActiveBackdrop(nextBackdrop?.id ?? null);
      setActiveSubject(nextSubject?.id ?? null);

      setFirstName(snapshot.firstName);
      setLastName(snapshot.lastName);
      setNameStyle(snapshot.nameStyle);
      setExportProfile(snapshot.exportProfile);
      updateComposition(snapshot.composition);
      clearBatch();
      setProjectName(payload.project?.name ?? 'Session');
      showToast('Project loaded.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Project load failed.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isGenerating = isGeneratingFlux || isGeneratingIdeogram || isGeneratingFromRef;

  return (
    <>
      {/* ─── Backdrop library with tabs ─── */}
      <section className="space-y-3 p-4 border-b border-[color:var(--panel-border)]">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Backdrops</h2>
          <span className="panel-meta">{backdrops.length}</span>
        </div>

        <Tabs defaultValue="upload">
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1 text-xs">Upload</TabsTrigger>
            <TabsTrigger value="ai-generate" className="flex-1 text-xs">AI Generate</TabsTrigger>
            <TabsTrigger value="reference" className="flex-1 text-xs">Reference Photo</TabsTrigger>
          </TabsList>

          {/* ──── Upload Tab ──── */}
          <TabsContent value="upload" className="space-y-3 pt-3">
            {/* Drag-and-drop zone */}
            <div
              className={`rounded-lg border-2 border-dashed transition-colors p-4 text-center cursor-pointer ${
                isDragOver
                  ? 'border-[#6367FF] bg-[#6367FF]/10 text-[#6367FF]'
                  : 'border-[color:var(--panel-border)] text-[var(--text-soft)] hover:border-[#6367FF]/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => triggerFilePicker('files')}
              role="button"
              aria-label="Drop backdrop images here or click to browse"
            >
              <p className="text-xs">
                {isDragOver ? 'Drop images here' : 'Drag & drop or click to browse'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" type="button" onClick={() => triggerFilePicker('files')}>
                Add Files
              </button>
              <button className="btn-secondary" type="button" onClick={() => { void pickFolder(); }}>
                Add Folder
              </button>
            </div>

            {/* Thumbnail grid */}
            {backdrops.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {backdrops.map((backdrop) => (
                  <div
                    key={backdrop.id}
                    className={`group relative rounded-lg overflow-hidden border-2 cursor-pointer transition-colors ${
                      backdrop.id === activeBackdropId
                        ? 'border-[#6367FF]'
                        : 'border-[color:var(--panel-border)] hover:border-[#6367FF]/50'
                    }`}
                    onClick={() => setActiveBackdrop(backdrop.id)}
                  >
                    <img
                      className="aspect-[4/5] w-full object-cover"
                      src={backdrop.objectUrl}
                      alt={backdrop.name}
                    />
                    {/* Hover delete button */}
                    <button
                      className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-black/70 text-white text-xs hover:bg-red-500/90 transition-colors"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemove(backdrop.id); }}
                      aria-label={`Remove ${backdrop.name}`}
                    >
                      ✕
                    </button>
                    <p className="truncate px-1 pb-1 pt-0.5 text-[10px] text-[var(--text-soft)] bg-black/40">
                      {backdrop.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ──── AI Generate Tab ──── */}
          <TabsContent value="ai-generate" className="space-y-4 pt-3">
            {/* Shared prompt */}
            <textarea
              className="input min-h-20 resize-y"
              placeholder="Describe the backdrop to generate…"
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
            />

            {/* Generation status */}
            {generation.status === 'polling' && generation.queuePosition !== undefined && (
              <p className="text-xs text-[var(--text-soft)]">Queue position: {generation.queuePosition}</p>
            )}
            {generation.status === 'error' && (
              <p className="text-xs text-red-400">{generation.error}</p>
            )}

            {/* ── Flux sub-section ── */}
            <div className="space-y-2 rounded-lg border border-[color:var(--panel-border)] p-3">
              <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wider">Flux</p>
              <input
                className="input"
                placeholder="Style hint"
                value={generateStyleHint}
                onChange={(e) => setGenerateStyleHint(e.target.value)}
              />
              <select
                className="input"
                value={generateAspectMode}
                onChange={(e) => setGenerateAspectMode(e.target.value as 'portrait' | 'landscape' | 'square')}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
                <option value="square">Square</option>
              </select>
              <button
                className="btn-secondary w-full"
                type="button"
                disabled={isGenerating}
                onClick={() =>
                  void runFalGeneration(
                    { prompt: generatePrompt, styleHint: generateStyleHint, aspectMode: generateAspectMode, model: 'flux' },
                    'flux',
                    setIsGeneratingFlux,
                  )
                }
              >
                {isGeneratingFlux ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⟳</span> Generating with Flux…
                  </span>
                ) : 'Generate with Flux'}
              </button>
            </div>

            {/* ── Ideogram v2 sub-section ── */}
            <div className="space-y-2 rounded-lg border border-[color:var(--panel-border)] p-3">
              <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wider">Ideogram v2</p>
              <select
                className="input"
                value={ideogramStyle}
                onChange={(e) => setIdeogramStyle(e.target.value as IdeogramStyleValue)}
              >
                {IDEOGRAM_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button
                className="btn-secondary w-full"
                type="button"
                disabled={isGenerating}
                onClick={() =>
                  void runFalGeneration(
                    { prompt: generatePrompt, model: 'ideogram', styleType: ideogramStyle },
                    'ideogram',
                    setIsGeneratingIdeogram,
                  )
                }
              >
                {isGeneratingIdeogram ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⟳</span> Generating with Ideogram…
                  </span>
                ) : 'Generate with Ideogram'}
              </button>
            </div>
          </TabsContent>

          {/* ──── Reference Photo Tab ──── */}
          <TabsContent value="reference" className="space-y-3 pt-3">
            <p className="text-xs text-[var(--text-soft)]">
              Upload a photo that captures the vibe or lighting you want. Gemini Vision will analyze it and write a backdrop generation prompt.
            </p>

            {/* Reference photo picker / preview */}
            <div
              className="rounded-lg border-2 border-dashed border-[color:var(--panel-border)] hover:border-[#6367FF]/50 transition-colors p-3 text-center cursor-pointer"
              onClick={handleRefPhotoSelect}
              role="button"
              aria-label="Upload reference photo"
            >
              {refPhotoDataUrl ? (
                <div className="space-y-1">
                  <img
                    src={refPhotoDataUrl}
                    alt="Reference"
                    className="mx-auto max-h-32 rounded object-contain"
                  />
                  <p className="text-[10px] text-[var(--text-soft)] truncate">{refPhotoName}</p>
                  <p className="text-[10px] text-[#6367FF]">Click to change</p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-soft)]">Click to upload reference photo</p>
              )}
            </div>

            <button
              className="btn-secondary w-full"
              type="button"
              disabled={!refPhotoDataUrl || isAnalyzingRef}
              onClick={() => { void analyzeReferencePhoto(); }}
            >
              {isAnalyzingRef ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⟳</span> Analyzing with Gemini…
                </span>
              ) : 'Analyze Reference Photo'}
            </button>

            {/* Generated prompt (editable) */}
            {refGeneratedPrompt && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-soft)] font-medium">Generated prompt (editable):</p>
                <textarea
                  className="input min-h-24 resize-y"
                  value={refGeneratedPrompt}
                  onChange={(e) => setRefGeneratedPrompt(e.target.value)}
                />
                <button
                  className="btn-secondary w-full"
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    void runFalGeneration(
                      { prompt: refGeneratedPrompt, model: 'flux' },
                      'ref-flux',
                      setIsGeneratingFromRef,
                    )
                  }
                >
                  {isGeneratingFromRef ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⟳</span> Generating…
                    </span>
                  ) : 'Generate Backdrop from This Prompt'}
                </button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {/* ─── Projects (Supabase) section — unchanged ─── */}
      <section className="space-y-3 p-4">
        <h2 className="panel-title">Projects (Supabase)</h2>
        <input
          className="input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-secondary"
            type="button"
            onClick={() => { void saveProject(); }}
            disabled={isSavingProject || supabaseConfigured !== true}
          >
            {isSavingProject ? 'Saving...' : 'Save'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => { void refreshProjects(); }}
            disabled={isLoadingProjects}
          >
            Refresh
          </button>
        </div>
        <div className="asset-list">
          {supabaseConfigured === false ? (
            <div className="asset-item">
              <p className="text-[11px] text-[var(--text-soft)]">
                {projectPersistenceReason ?? 'Remote project persistence is unavailable in this environment.'}
              </p>
            </div>
          ) : null}
          {savedProjects.map((project) => (
            <div key={project.id} className="asset-item">
              <button
                className="asset-select"
                type="button"
                onClick={() => { void loadProject(project.id); }}
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
    </>
  );
}
