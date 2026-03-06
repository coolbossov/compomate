/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useBackdrops, useGeneration } from '@/lib/store/selectors';
import {
  filesToBackdropAssets,
  collectImageFiles,
  dataUrlToBackdropAsset,
  parseErrorText,
  wait,
  isProjectSnapshot,
  fileToDataUrl,
} from '@/lib/client/utils';
import {
  BACKDROP_POLL_INTERVAL_MS,
  BACKDROP_MAX_POLLS,
  BACKDROP_DEFAULT_STYLE_HINT,
} from '@/lib/constants';
import type {
  FalBackdropPendingPayload,
  FalBackdropCompletedPayload,
} from '@/types/export';
import { isFalPending, isFalCompleted } from '@/types/export';
import type { StoredProjectSummary } from '@/lib/shared/project-snapshot';

// ---------------------------------------------------------------------------
// Local type guards for fal payloads (page.tsx had inline guards)
// ---------------------------------------------------------------------------

function isFalPayload(value: unknown): value is FalBackdropPendingPayload | FalBackdropCompletedPayload {
  return !!value && typeof value === 'object' && 'pending' in (value as object);
}

export function BackdropPanel() {
  const backdrops = useBackdrops();
  const activeBackdropId = useStore((s) => s.activeBackdropId);
  const generation = useGeneration();
  const addBackdrop = useStore((s) => s.addBackdrop);
  const removeBackdrop = useStore((s) => s.removeBackdrop);
  const setActiveBackdrop = useStore((s) => s.setActiveBackdrop);
  const setGeneration = useStore((s) => s.setGeneration);
  const showToast = useStore((s) => s.showToast);

  const objectUrlsRef = useRef(new Set<string>());

  // AI generation local state
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateStyleHint, setGenerateStyleHint] = useState(BACKDROP_DEFAULT_STYLE_HINT);
  const [generateAspectMode, setGenerateAspectMode] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [isGeneratingBackdrop, setIsGeneratingBackdrop] = useState(false);

  // Projects (Supabase) local state
  const [projectName, setProjectName] = useState('Session');
  const [savedProjects, setSavedProjects] = useState<StoredProjectSummary[]>([]);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | null>(null);
  const [projectPersistenceReason, setProjectPersistenceReason] = useState<string | null>(null);

  // Store selectors for snapshot
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
  const addSubjects = useStore((s) => s.addSubjects);
  const setActiveSubject = useStore((s) => s.setActiveSubject);
  const clearBatch = useStore((s) => s.clearBatch);

  function registerUrl(url: string) { objectUrlsRef.current.add(url); }

  async function handleBackdropFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const { assets, skipped } = await filesToBackdropAssets(files);
    if (assets.length === 0) { showToast(skipped[0] ?? 'No valid image files found.'); return; }
    for (const asset of assets) { registerUrl(asset.objectUrl); addBackdrop(asset); }
    if (!activeBackdropId && assets.length > 0) setActiveBackdrop(assets[0].id);
    const suffix = skipped.length > 0 ? ` ${skipped.slice(0, 2).join(' ')}` : '';
    showToast(`Added ${assets.length} backdrop file(s).${suffix}`);
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

  async function generateBackdropWithFal(): Promise<void> {
    const prompt = generatePrompt.trim();
    if (!prompt) { showToast('Enter a prompt before generating a backdrop.'); return; }
    setIsGeneratingBackdrop(true);
    setGeneration({ status: 'generating', prompt });
    showToast('Generating backdrop with fal...');
    try {
      const response = await fetch('/api/generate-backdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, styleHint: generateStyleHint, aspectMode: generateAspectMode }),
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
        showToast(`Backdrop queued${latest.queuePosition !== null && latest.queuePosition !== undefined ? ` (queue ${latest.queuePosition})` : ''}. Waiting...`);

        for (let attempt = 0; attempt < BACKDROP_MAX_POLLS; attempt++) {
          await wait(BACKDROP_POLL_INTERVAL_MS);
          const query = new URLSearchParams({ statusUrl: latest.statusUrl, responseUrl: latest.responseUrl });
          const pollResponse = await fetch(`/api/generate-backdrop?${query}`, { cache: 'no-store' });
          if (!pollResponse.ok) { const text = await pollResponse.text(); throw new Error(parseErrorText(text)); }
          const polled = (await pollResponse.json()) as unknown;
          if (!isFalPayload(polled)) throw new Error('Unexpected fal polling response.');
          if (isFalCompleted(polled)) { completed = polled; break; }
          if (isFalPending(polled)) {
            latest = polled;
            setGeneration({ queuePosition: latest.queuePosition ?? undefined });
            showToast(`Waiting for fal generation...${latest.queuePosition ? ` Queue ${latest.queuePosition}.` : ''}`);
          }
        }
      }

      if (!completed?.dataUrl) throw new Error('Backdrop still queued. Try again in a moment.');

      const asset = await dataUrlToBackdropAsset(
        `fal_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        completed.dataUrl,
        prompt,
      );
      registerUrl(asset.objectUrl);
      addBackdrop(asset);
      setActiveBackdrop(asset.id);
      setGeneration({ status: 'done' });
      showToast('Generated backdrop added to library.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backdrop generation failed.';
      setGeneration({ status: 'error', error: message });
      showToast(message);
    } finally {
      setIsGeneratingBackdrop(false);
    }
  }

  // Projects (Supabase)
  const activeBackdrop = backdrops.find((b) => b.id === activeBackdropId) ?? null;
  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;

  async function buildSnapshot() {
    const [serializedBackdrop, serializedSubject] = await Promise.all([
      activeBackdrop
        ? (async () => {
            // BackdropAsset has no `file` — need to fetch from objectUrl
            const resp = await fetch(activeBackdrop.objectUrl);
            const blob = await resp.blob();
            const file = new File([blob], activeBackdrop.name, { type: blob.type });
            const dataUrl = await fileToDataUrl(file);
            return { name: activeBackdrop.name, dataUrl };
          })()
        : Promise.resolve(null),
      activeSubject
        ? fileToDataUrl(activeSubject.file).then((dataUrl) => ({ name: activeSubject.name, dataUrl }))
        : Promise.resolve(null),
    ]);
    return {
      version: 1,
      firstName,
      lastName,
      nameStyle: nameStyleId,
      exportProfile: exportProfileId,
      composition,
      activeBackdrop: serializedBackdrop,
      activeSubject: serializedSubject,
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

      const { dataUrlToAsset, dataUrlToBackdropAsset: toBackdrop } = await import('@/lib/client/utils');
      const nextBackdrop = snapshot.activeBackdrop
        ? await toBackdrop(snapshot.activeBackdrop.name, snapshot.activeBackdrop.dataUrl)
        : null;
      const nextSubject = snapshot.activeSubject
        ? await dataUrlToAsset(snapshot.activeSubject.name, snapshot.activeSubject.dataUrl)
        : null;

      // Clear existing assets
      for (const b of backdrops) { if (objectUrlsRef.current.has(b.objectUrl)) { URL.revokeObjectURL(b.objectUrl); objectUrlsRef.current.delete(b.objectUrl); } }
      for (const s of subjects) { if (objectUrlsRef.current.has(s.objectUrl)) { URL.revokeObjectURL(s.objectUrl); objectUrlsRef.current.delete(s.objectUrl); } }

      if (nextBackdrop) { registerUrl(nextBackdrop.objectUrl); addBackdrop(nextBackdrop); setActiveBackdrop(nextBackdrop.id); }
      if (nextSubject) { registerUrl(nextSubject.objectUrl); addSubjects([nextSubject]); setActiveSubject(nextSubject.id); }

      setFirstName(snapshot.firstName);
      setLastName(snapshot.lastName);
      setNameStyle(snapshot.nameStyle);
      setExportProfile(snapshot.exportProfile);
      Object.keys(snapshot.composition).forEach(() => updateComposition(snapshot.composition));
      clearBatch();
      setProjectName(payload.project?.name ?? 'Session');
      showToast('Project loaded.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Project load failed.');
    }
  }

  return (
    <>
      {/* Backdrops section */}
      <section className="space-y-3 p-4 border-b border-[color:var(--panel-border)]">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Backdrops</h2>
          <span className="panel-meta">{backdrops.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" type="button" onClick={() => triggerFilePicker('files')}>
            Add Files
          </button>
          <button className="btn-secondary" type="button" onClick={() => { void pickFolder(); }}>
            Add Folder
          </button>
        </div>
        <div className="asset-list">
          {backdrops.map((backdrop) => (
            <div
              key={backdrop.id}
              className={`asset-item ${backdrop.id === activeBackdropId ? 'asset-item-active' : ''}`}
            >
              <button
                className="asset-select"
                type="button"
                onClick={() => setActiveBackdrop(backdrop.id)}
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
                onClick={() => handleRemove(backdrop.id)}
                aria-label={`Remove ${backdrop.name}`}
                title={`Remove ${backdrop.name}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* AI Generation section */}
      <section className="space-y-3 p-4 border-b border-[color:var(--panel-border)]">
        <h2 className="panel-title">Generate Backdrop (fal)</h2>
        <textarea
          className="input min-h-20 resize-y"
          placeholder="Describe the backdrop to generate"
          value={generatePrompt}
          onChange={(e) => setGeneratePrompt(e.target.value)}
        />
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

        {generation.status === 'polling' && generation.queuePosition !== undefined ? (
          <p className="text-xs text-[var(--text-soft)]">
            Queue position: {generation.queuePosition}
          </p>
        ) : null}
        {generation.status === 'error' ? (
          <p className="text-xs text-red-400">{generation.error}</p>
        ) : null}

        <button
          className="btn-secondary w-full"
          type="button"
          onClick={() => { void generateBackdropWithFal(); }}
          disabled={isGeneratingBackdrop}
        >
          {isGeneratingBackdrop ? 'Generating...' : 'Generate Backdrop'}
        </button>
      </section>

      {/* Projects (Supabase) section */}
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
