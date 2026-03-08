/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useSubjects } from '@/lib/store/selectors';
import { filesToAssets, collectImageFiles } from '@/lib/client/utils';
import { computeAutoPlacement } from '@/lib/client/autoPlacement';
import { uploadFileToR2 } from '@/lib/client/uploader';
import { RosterImportPanel } from './RosterImportPanel';

export function FilePanel() {
  const subjects = useSubjects();
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const addSubjects = useStore((s) => s.addSubjects);
  const removeSubject = useStore((s) => s.removeSubject);
  const updateSubject = useStore((s) => s.updateSubject);
  const setActiveSubject = useStore((s) => s.setActiveSubject);
  const showToast = useStore((s) => s.showToast);
  const updateComposition = useStore((s) => s.updateComposition);
  const lockSettings = useStore((s) => s.lockSettings);

  const objectUrlsRef = useRef(new Set<string>());
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  // Auto-placement — run whenever the active subject changes
  useEffect(() => {
    if (lockSettings) return;
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
  }, [activeSubjectId, subjects, updateComposition, lockSettings]);

  const filteredSubjects = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return subjects;
    return subjects.filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(query);
      return nameMatch;
    });
  }, [subjects, searchText]);

  function registerUrls(urls: string[]) {
    for (const url of urls) objectUrlsRef.current.add(url);
  }

  const handleFiles = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgressText(null);
    try {
      const { assets, skipped } = await filesToAssets(files, (current, total) => {
        setProgressText(`Processing ${current} / ${total}…`);
      });
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
      setProgressText(null);
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
            ? (progressText ?? 'Processing files…')
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

      {/* Roster CSV import */}
      <RosterImportPanel />

      {/* Search input */}
      {subjects.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-soft)]" />
          <input
            type="search"
            className="input w-full pl-8 text-xs"
            placeholder="Search subjects…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      )}

      <div className="asset-list">
        {filteredSubjects.map((subject) => (
          <div
            key={subject.id}
            className={`asset-item ${subject.id === activeSubjectId ? 'asset-item-active' : ''}`}
          >
            <button
              className="asset-select"
              type="button"
              onClick={() => setActiveSubject(subject.id)}
            >
              <div className="relative h-12 w-12 flex-shrink-0">
                <img
                  className="h-12 w-12 rounded object-cover"
                  src={subject.objectUrl}
                  alt={subject.name}
                />
                {subject.exported && (
                  <CheckCircle2
                    className="absolute right-0 top-0 h-4 w-4 text-green-400 drop-shadow"
                    aria-label="Exported"
                  />
                )}
              </div>
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
