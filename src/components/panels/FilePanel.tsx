/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto-placement — run whenever the active subject changes
  useEffect(() => {
    const subject = subjects.find((s) => s.id === activeSubjectId);
    if (!activeSubjectId || !subject) {
      return;
    }

    let cancelled = false;
    void computeAutoPlacement(subject).then((patch) => {
      if (!cancelled) {
        updateComposition(patch);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeSubjectId, subjects, updateComposition]);

  function registerUrls(urls: string[]) {
    for (const url of urls) objectUrlsRef.current.add(url);
  }

  const handleFiles = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
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
    } finally {
      setIsProcessing(false);
    }
  }, [addSubjects, showToast, updateSubject]);

  function limitedUploadCount(files: File[], assets: { id: string }[]): number {
    return Math.min(files.length, assets.length);
  }

  // ── Drag-and-drop handlers ──
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('image/') || /\.(tif|tiff)$/i.test(f.name)
    );
    if (files.length === 0) {
      showToast('No valid image files found in drop.');
      return;
    }
    void handleFiles(files);
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
        aria-label="Drop subject images here or click to browse"
      >
        <p className="text-xs">
          {isProcessing
            ? 'Processing files…'
            : isDragOver
              ? 'Drop images here'
              : 'Drag & drop or click to browse'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" type="button" disabled={isProcessing} onClick={() => triggerFilePicker('files')}>
          {isProcessing ? 'Processing…' : 'Add Files'}
        </button>
        <button className="btn-secondary" type="button" disabled={isProcessing} onClick={() => { void pickFolder(); }}>
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
