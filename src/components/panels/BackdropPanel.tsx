'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useBackdrops, useGeneration } from '@/lib/store/selectors';
import {
  filesToBackdropAssets,
  dataUrlToBackdropAsset,
  dataUrlToBlob,
  blobToBackdropAsset,
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
import type { SerializedBackdropAsset } from '@/lib/shared/project-snapshot';
import type { BackdropAsset } from '@/types/backdrop';
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

export interface BackdropPanelHandle {
  generateDirections: (prompt: string) => Promise<void>;
  finishProductionMaster: () => Promise<void>;
}

export const BackdropPanel = forwardRef<BackdropPanelHandle>(function BackdropPanel(_, ref) {
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
  const backgroundStudio = useStore((s) => s.backgroundStudio);
  const replaceBackgroundStudio = useStore((s) => s.replaceBackgroundStudio);
  const activeBackdrop = backdrops.find((backdrop) => backdrop.id === activeBackdropId) ?? null;

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
      asset.persistenceStatus = 'pending';
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
        .then(({ key }) => { updateBackdrop(asset.id, { r2Key: key, persistenceStatus: 'ready' }); })
        .catch(() => { updateBackdrop(asset.id, { persistenceStatus: 'error' }); });
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

  async function retryBackdropSave(id: string): Promise<void> {
    const asset = backdrops.find((backdrop) => backdrop.id === id);
    if (!asset) return;
    updateBackdrop(id, { persistenceStatus: 'pending' });
    try {
      const blob = await fetch(asset.objectUrl).then((response) => {
        if (!response.ok) throw new Error('The local image could not be read.');
        return response.blob();
      });
      const { key } = await uploadBlobToR2(blob, asset.name, 'backdrop');
      updateBackdrop(id, { r2Key: key, persistenceStatus: 'ready' });
      showToast('Asset saved. The project can now be restored later.');
    } catch {
      updateBackdrop(id, { persistenceStatus: 'error' });
      showToast('Asset save failed again. Check storage settings or remove and regenerate this option.');
    }
  }

  // ---------------------------------------------------------------------------
  // Shared fal.ai generation helper
  // ---------------------------------------------------------------------------

  async function runFalGeneration(
    body: Record<string, unknown>,
    filenamePrefix: string,
    setGenerating: (v: boolean) => void,
    stage?: 'direction' | 'master',
  ): Promise<BackdropAsset[]> {
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt && body.mode !== 'master') { showToast('Enter a prompt before generating.'); return []; }

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

      const completedImages = completed?.images?.length
        ? completed.images
        : completed?.sourceUrl
          ? [{ dataUrl: completed.dataUrl, sourceUrl: completed.sourceUrl }]
          : [];
      if (completedImages.length === 0) throw new Error('Backdrop still queued. Try again in a moment.');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const assets: BackdropAsset[] = [];
      const assetBlobs: Blob[] = [];
      for (let index = 0; index < completedImages.length; index += 1) {
        const image = completedImages[index];
        if (!image) continue;
        const blob = image.dataUrl
          ? dataUrlToBlob(image.dataUrl)
          : await fetch(`/api/generate-backdrop/image?url=${encodeURIComponent(image.sourceUrl)}`, { cache: 'no-store' }).then(async (imageResponse) => {
              if (!imageResponse.ok) throw new Error(parseErrorText(await imageResponse.text()));
              return imageResponse.blob();
            });
        const asset = await blobToBackdropAsset(
          `${filenamePrefix}_${index + 1}_${timestamp}.jpg`,
          blob,
          prompt,
          {
            source: stage === 'direction' ? 'ai-direction' : stage === 'master' ? 'ai-master' : body.model === 'ideogram' ? 'ai-ideogram' : 'ai-flux',
            stage,
            providerSourceUrl: image.sourceUrl,
            persistenceStatus: 'pending',
          },
        );
        asset.width = image.width ?? asset.width;
        asset.height = image.height ?? asset.height;
        registerUrl(asset.objectUrl);
        addBackdrop(asset);
        assets.push(asset);
        assetBlobs.push(blob);
      }
      const selected = stage === 'direction' ? assets[0] : assets.at(-1);
      if (selected) setActiveBackdrop(selected.id);
      setGeneration({ status: 'done' });
      captureEvent('backdrop_generated', {
        model: String(body.model ?? 'flux'),
        duration_ms: Date.now() - generationStartedAt,
      });
      showToast(stage === 'direction'
        ? `${assets.length} directions generated. Select the strongest one to refine.`
        : stage === 'master'
          ? 'Production master finished and selected.'
          : 'Generated backdrop added to library.');

      await Promise.all(assets.map(async (asset, index) => {
        try {
          const blob = assetBlobs[index];
          if (!blob) throw new Error('Generated image payload is unavailable.');
          const { key } = await uploadBlobToR2(blob, asset.name, 'backdrop');
          updateBackdrop(asset.id, { r2Key: key, persistenceStatus: 'ready' });
        } catch {
          updateBackdrop(asset.id, { persistenceStatus: 'error' });
        }
      }));
      return assets;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backdrop generation failed.';
      setGeneration({ status: 'error', error: message });
      showToast(message);
      return [];
    } finally {
      setGenerating(false);
    }
  }

  async function getRestorableSourceUrl(asset: BackdropAsset): Promise<string> {
    if (asset.providerSourceUrl?.startsWith('https://')) return asset.providerSourceUrl;
    if (!asset.r2Key) throw new Error('Wait for the selected direction to finish saving before creating the master.');
    const response = await fetch(`/api/r2/download?key=${encodeURIComponent(asset.r2Key)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(parseErrorText(await response.text()));
    const payload = (await response.json()) as { downloadUrl?: string };
    if (!payload.downloadUrl?.startsWith('https://')) throw new Error('Stored direction download URL is unavailable.');
    return payload.downloadUrl;
  }

  useImperativeHandle(ref, () => ({
    async generateDirections(prompt: string) {
      await runFalGeneration({ mode: 'directions', prompt, count: 3 }, 'direction', () => {}, 'direction');
    },
    async finishProductionMaster() {
      if (!activeBackdrop) {
        showToast('Select a direction before finishing the production master.');
        return;
      }
      if (activeBackdrop.stage === 'master') {
        showToast('This is already a production master.');
        return;
      }
      try {
        const sourceImageUrl = await getRestorableSourceUrl(activeBackdrop);
        await runFalGeneration(
          { mode: 'master', prompt: activeBackdrop.prompt ?? 'production background master', sourceImageUrl },
          'production_master',
          () => {},
          'master',
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Production master could not be created.');
      }
    },
  }));

  // ---------------------------------------------------------------------------
  // Projects (Supabase)
  // ---------------------------------------------------------------------------

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const hasUnrestorableBackdrops = backdrops.some((backdrop) =>
    !backdrop.r2Key && (backdrop.persistenceStatus === 'pending' || backdrop.source.startsWith('ai-')),
  );

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

  async function serializeBackdrop(asset: BackdropAsset): Promise<SerializedBackdropAsset> {
    if ((asset.source.startsWith('ai-') || asset.stage) && !asset.r2Key) {
      throw new Error(`“${asset.name}” is not saved to the asset library yet. Wait for upload to finish, then save the project.`);
    }
    const stored = await serializeAsset(asset);
    if (!stored) throw new Error(`Could not prepare “${asset.name}” for project save.`);
    return {
      ...stored,
      id: asset.id,
      width: asset.width,
      height: asset.height,
      source: asset.source,
      prompt: asset.prompt,
      stage: asset.stage,
      providerSourceUrl: asset.providerSourceUrl,
      createdAt: asset.createdAt,
    };
  }

  async function buildSnapshot() {
    const [serializedBackdrop, serializedSubject, serializedBackdrops] = await Promise.all([
      serializeAsset(activeBackdrop),
      serializeAsset(activeSubject, activeSubject?.file),
      Promise.all(backdrops.map(serializeBackdrop)),
    ]);
    return {
      version: PROJECT_SNAPSHOT_VERSION,
      firstName,
      lastName,
      nameStyle: nameStyleId,
      exportProfile: exportProfileId,
      composition,
      activeBackdrop: serializedBackdrop,
      activeSubject: serializedSubject,
      backdrops: serializedBackdrops,
      activeBackdropId,
      backgroundStudio,
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
      showToast('Project saved. You can reopen this complete workspace later.');
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

      const serializedBackdrops = snapshot.version === PROJECT_SNAPSHOT_VERSION
        ? snapshot.backdrops ?? []
        : snapshot.activeBackdrop ? [snapshot.activeBackdrop] : [];
      const nextBackdrops = await Promise.all(serializedBackdrops.map(async (stored) => {
        const studioAsset = snapshot.version === PROJECT_SNAPSHOT_VERSION
          ? stored as SerializedBackdropAsset
          : null;
        const metadata = studioAsset ? {
          id: studioAsset.id,
          source: studioAsset.source,
          stage: studioAsset.stage,
          providerSourceUrl: studioAsset.providerSourceUrl,
          createdAt: studioAsset.createdAt,
          width: studioAsset.width,
          height: studioAsset.height,
        } : undefined;
        if (stored.r2Key) return r2KeyToBackdropAsset(stored.name, stored.r2Key, studioAsset?.prompt, metadata);
        if (stored.dataUrl) return dataUrlToBackdropAsset(stored.name, stored.dataUrl, studioAsset?.prompt, metadata);
        return null;
      }));
      const restoredBackdrops = nextBackdrops.filter((asset): asset is BackdropAsset => asset !== null);
      const nextSubject = snapshot.activeSubject
        ? snapshot.activeSubject.r2Key
          ? await r2KeyToAsset(snapshot.activeSubject.name, snapshot.activeSubject.r2Key)
          : snapshot.activeSubject.dataUrl
            ? await dataUrlToAsset(snapshot.activeSubject.name, snapshot.activeSubject.dataUrl)
            : null
        : null;

      for (const b of backdrops) { if (objectUrlsRef.current.has(b.objectUrl)) { URL.revokeObjectURL(b.objectUrl); objectUrlsRef.current.delete(b.objectUrl); } }
      for (const s of subjects) { if (objectUrlsRef.current.has(s.objectUrl)) { URL.revokeObjectURL(s.objectUrl); objectUrlsRef.current.delete(s.objectUrl); } }

      for (const backdrop of restoredBackdrops) registerUrl(backdrop.objectUrl);
      if (nextSubject) registerUrl(nextSubject.objectUrl);

      replaceBackdrops(restoredBackdrops);
      replaceSubjects(nextSubject ? [nextSubject] : []);
      const restoredActiveId = snapshot.version === PROJECT_SNAPSHOT_VERSION
        ? snapshot.activeBackdropId ?? null
        : restoredBackdrops[0]?.id ?? null;
      setActiveBackdrop(restoredBackdrops.some((asset) => asset.id === restoredActiveId) ? restoredActiveId : restoredBackdrops[0]?.id ?? null);
      setActiveSubject(nextSubject?.id ?? null);

      setFirstName(snapshot.firstName);
      setLastName(snapshot.lastName);
      setNameStyle(snapshot.nameStyle);
      setExportProfile(snapshot.exportProfile);
      updateComposition(snapshot.composition);
      if (snapshot.version === PROJECT_SNAPSHOT_VERSION && snapshot.backgroundStudio) {
        replaceBackgroundStudio(snapshot.backgroundStudio);
      }
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
              onRetrySave={retryBackdropSave}
            />
          </TabsContent>

          {/* ──── AI Generate Tab ──── */}
          <TabsContent value="ai-generate" className="space-y-4 pt-3">
            <BackdropAIGenerateTab
              onGenerate={runFalGeneration}
              generation={generation}
              isAnyGenerating={generation.status === 'generating' || generation.status === 'polling'}
            />
          </TabsContent>

          {/* ──── Reference Photo Tab ──── */}
          <TabsContent value="reference" className="space-y-3 pt-3">
            <BackdropReferencePhotoTab
              onGenerate={runFalGeneration}
              isAnyGenerating={generation.status === 'generating' || generation.status === 'polling'}
              showToast={showToast}
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* ─── Saved projects ─── */}
      <section className="space-y-3 p-4">
        <div>
          <h2 className="panel-title">Saved projects</h2>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-soft)]">Save directions, the selected design, overlays, and the production master so this workspace can be reopened later.</p>
        </div>
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
            disabled={isSavingProject || supabaseConfigured !== true || hasUnrestorableBackdrops}
            title={hasUnrestorableBackdrops ? 'Wait for generated assets to finish saving.' : undefined}
          >
            {isSavingProject ? 'Saving…' : hasUnrestorableBackdrops ? 'Saving assets…' : 'Save project'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => { void refreshProjects(); }}
            disabled={isLoadingProjects}
          >
            Refresh list
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
});
