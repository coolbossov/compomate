/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useSubjects } from '@/lib/store/selectors';
import { filesToAssets, collectImageFiles } from '@/lib/client/utils';
import { computeAutoPlacement } from '@/lib/client/autoPlacement';
import { uploadFileToR2 } from '@/lib/client/uploader';

export function FilePanel() {
  const subjects = useSubjects();
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const addSubjects = useStore((s) => s.addSubjects);
  const removeSubject = useStore((s) => s.removeSubject);
  const updateSubject = useStore((s) => s.updateSubject);
  const setActiveSubject = useStore((s) => s.setActiveSubject);
  const showToast = useStore((s) => s.showToast);
  const updateComposition = useStore((s) => s.updateComposition);

  const objectUrlsRef = useRef(new Set<string>());

  // Auto-placement — run whenever the active subject changes
  useEffect(() => {
    if (!activeSubjectId) return;
    const subject = subjects.find((s) => s.id === activeSubjectId);
    if (subject) {
      void computeAutoPlacement(subject).then((patch) => updateComposition(patch));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubjectId]);

  function registerUrls(urls: string[]) {
    for (const url of urls) objectUrlsRef.current.add(url);
  }

  async function handleFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const { assets, skipped } = await filesToAssets(files);
    if (assets.length === 0) {
      showToast(skipped[0] ?? 'No valid image files found.');
      return;
    }
    registerUrls(assets.map((a) => a.objectUrl));
    addSubjects(assets);
    const suffix = skipped.length > 0 ? ` ${skipped.slice(0, 2).join(' ')}` : '';
    showToast(`Added ${assets.length} subject file(s).${suffix}`);

    for (let i = 0; i < limitedUploadCount(files, assets); i += 1) {
      const file = files[i];
      const asset = assets[i];
      if (!file || !asset) continue;
      uploadFileToR2(file, 'subject')
        .then(({ key }) => {
          updateSubject(asset.id, { r2Key: key });
        })
        .catch(() => {
          // Non-critical: exports fall back to data URLs when R2 is unavailable.
        });
    }
  }

  function limitedUploadCount(files: File[], assets: { id: string }[]): number {
    return Math.min(files.length, assets.length);
  }

  function triggerFilePicker(mode: 'files' | 'folder'): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.tif,.tiff';
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    if (mode === 'folder') {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; input.onchange = null; input.oncancel = null; input.remove(); };
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      void handleFiles(files).then(cleanup);
    };
    input.oncancel = () => { cleanup(); showToast(mode === 'folder' ? 'Folder selection cancelled.' : 'File selection cancelled.'); };
    document.body.append(input);
    input.click();
  }

  async function pickFolder(): Promise<void> {
    const win = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (win.showDirectoryPicker) {
      try {
        const handle = await win.showDirectoryPicker();
        const files = await collectImageFiles(handle);
        await handleFiles(files);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.toLowerCase().includes('abort')) { showToast('Folder selection cancelled.'); return; }
      }
    }
    triggerFilePicker('folder');
  }

  function handleRemove(id: string): void {
    const subject = subjects.find((s) => s.id === id);
    if (subject && objectUrlsRef.current.has(subject.objectUrl)) {
      URL.revokeObjectURL(subject.objectUrl);
      objectUrlsRef.current.delete(subject.objectUrl);
    }
    removeSubject(id);
    showToast('Subject removed.');
  }

  return (
    <section className="space-y-3 p-4 border-b border-[color:var(--panel-border)]">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Subjects</h2>
        <span className="panel-meta">{subjects.length}</span>
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
        {subjects.map((subject) => (
          <div
            key={subject.id}
            className={`asset-item ${subject.id === activeSubjectId ? 'asset-item-active' : ''}`}
          >
            <button
              className="asset-select"
              type="button"
              onClick={() => setActiveSubject(subject.id)}
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
              onClick={() => handleRemove(subject.id)}
              aria-label={`Remove ${subject.name}`}
              title={`Remove ${subject.name}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
