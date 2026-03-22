/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import type { BackdropAsset } from '@/types/backdrop';
import { collectImageFiles } from '@/lib/client/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BackdropLibraryProps {
  backdrops: BackdropAsset[];
  activeBackdropId: string | null;
  onAdd: (files: File[]) => Promise<void>;
  onRemove: (id: string) => void;
  onSetActive: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackdropLibrary({
  backdrops,
  activeBackdropId,
  onAdd,
  onRemove,
  onSetActive,
}: BackdropLibraryProps) {
  const [isDragOver, setIsDragOver] = useState(false);

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
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('image/') || /\.(tif|tiff)$/i.test(f.name)
    );
    void onAdd(files);
  }

  // ---------------------------------------------------------------------------
  // File / folder picker
  // ---------------------------------------------------------------------------

  function triggerFilePicker(mode: 'files' | 'folder'): void {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'image/*,.tif,.tiff';
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    if (mode === 'folder') { input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', ''); }
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; input.onchange = null; input.oncancel = null; input.remove(); };
    input.onchange = () => { const files = input.files ? Array.from(input.files) : []; void onAdd(files).then(cleanup); };
    input.oncancel = () => { cleanup(); };
    document.body.append(input); input.click();
  }

  async function pickFolder(): Promise<void> {
    const win = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (win.showDirectoryPicker) {
      try {
        const handle = await win.showDirectoryPicker();
        const files = await collectImageFiles(handle);
        await onAdd(files); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.toLowerCase().includes('abort')) { return; }
      }
    }
    triggerFilePicker('folder');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-3">
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
              onClick={() => {
                // Click active backdrop again to deselect it
                if (backdrop.id === activeBackdropId) {
                  onSetActive(null);
                } else {
                  onSetActive(backdrop.id);
                }
              }}
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
                onClick={(e) => { e.stopPropagation(); onRemove(backdrop.id); }}
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
    </div>
  );
}
