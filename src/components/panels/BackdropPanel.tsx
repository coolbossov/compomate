'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useBackdrops, useGeneration } from '@/lib/store/selectors';
import {
  filesToBackdropAssets,
  dataUrlToBackdropAsset,
  parseErrorText,
  wait,
  isProjectSnapshot,
  fileToDataUrl,
  r2KeyToAsset,
  r2KeyToBackdropAsset,
  dataUrlToAsset,
} from '@/lib/client/utils';
import { uploadBlobToR2 } from '@/lib/client/uploader';
import { captureEvent } from '@/lib/client/posthog';
import {
  BACKDROP_POLL_INTERVAL_MS,
  BACKDROP_MAX_POLLS,
  PROJECT_SNAPSHOT_VERSION,
} from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type {
  FalBackdropPendingPayload,
  FalBackdropCompletedPayload,
} from '@/types/export';
import { isFalPending, isFalCompleted } from '@/types/export';
import type { SerializedAsset, StoredProjectSummary } from '@/lib/shared/project-snapshot';
import { BackdropLibrary } from './BackdropLibrary';
import { BackdropAIGenerateTab } from './BackdropAIGenerateTab';
import { BackdropReferencePhotoTab } from './BackdropReferencePhotoTab';

// ---------------------------------------------------------------------------
// Local type guards for fal payloads
// ---------------------------------------------------------------------------

function isFalPayload(value: unknown): value is FalBackdropPendingPayload | FalBackdropCompletedPayload {
  return !!value && typeof value === 'object' && 'pending' in (value as object);
}

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

  // ----- Projects (Supabase) state -----
  const [projectName, setProjectName] = useState('Session');
  const [savedProjects, setSavedProjects] = useState<StoredProjectSummary[]>([]);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingProjectId, setIsLoadingProjectId] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | null>(null);
  const [projectPersistenceReason, setProjectPersistenceReason] = useState<string | null>(null);

  useEffect(() => {
    void refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const generationStartedAt = Date.now();

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
      captureEvent('backdrop_generated', {
        model: String(body.model ?? 'flux'),
        duration_ms: Date.now() - generationStartedAt,
      });
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
  // Projects (Supabase)
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

    if (isLoadingProjectId !== null) {
      return;
    }

    const shouldReplace = window.confirm(
      'Loading this project replaces your current backdrop, subject, and queued exports. Continue?',
    );

    if (!shouldReplace) {
      return;
    }

    setIsLoadingProjectId(projectId);

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
    } finally {
      setIsLoadingProjectId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
            <BackdropLibrary
              backdrops={backdrops}
              activeBackdropId={activeBackdropId}
              onAdd={handleBackdropFiles}
              onRemove={handleRemove}
              onSetActive={setActiveBackdrop}
            />
          </TabsContent>

          {/* ──── AI Generate Tab ──── */}
          <TabsContent value="ai-generate" className="space-y-4 pt-3">
            <BackdropAIGenerateTab
              onGenerate={runFalGeneration}
              generation={generation}
              isAnyGenerating={false}
            />
          </TabsContent>

          {/* ──── Reference Photo Tab ──── */}
          <TabsContent value="reference" className="space-y-3 pt-3">
            <BackdropReferencePhotoTab
              onGenerate={runFalGeneration}
              isAnyGenerating={false}
              showToast={showToast}
            />
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
                disabled={isLoadingProjects || isLoadingProjectId !== null}
              >
                <span className="truncate">
                  {isLoadingProjectId === project.id ? `Loading ${project.name}...` : project.name}
                </span>
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
