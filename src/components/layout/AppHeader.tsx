'use client';

import { Redo2, Undo2 } from 'lucide-react';
import { redo, undo, useStore } from '@/lib/store';
import {
  useCanRedo,
  useCanUndo,
  useRedoCount,
  useShowDangerZone,
  useShowSideBySide,
  useUndoCount,
} from '@/lib/store/selectors';

export function AppHeader() {
  const jobName = useStore((s) => s.jobName);
  const setJobName = useStore((s) => s.setJobName);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);
  const setShowSideBySide = useStore((s) => s.setShowSideBySide);
  const setShowDangerZone = useStore((s) => s.setShowDangerZone);
  const showSideBySide = useShowSideBySide();
  const showDangerZone = useShowDangerZone();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const undoCount = useUndoCount();
  const redoCount = useRedoCount();

  return (
    <header className="flex h-14 items-center justify-between border-b border-[color:var(--panel-border)] px-5 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide">CompoMate</p>
          <p className="text-xs text-[var(--text-soft)]">Composite production workstation</p>
        </div>
        <input
          className="input h-7 w-48 text-xs"
          placeholder="Job name"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          aria-label="Job name"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary h-7 w-7 p-0"
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label="Undo"
          title={canUndo ? `Undo (${undoCount} available)` : 'Undo'}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn-secondary h-7 w-7 p-0"
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label="Redo"
          title={canRedo ? `Redo (${redoCount} available)` : 'Redo'}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`btn-secondary h-7 px-2 text-xs ${
            showSideBySide
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : ''
          }`}
          onClick={() => setShowSideBySide(!showSideBySide)}
          aria-pressed={showSideBySide}
          title="Toggle side-by-side subject and composite preview"
        >
          Compare
        </button>
        <button
          type="button"
          className={`btn-secondary h-7 px-2 text-xs ${
            showDangerZone
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : ''
          }`}
          onClick={() => setShowDangerZone(!showDangerZone)}
          aria-pressed={showDangerZone}
          title="Toggle crop guides"
        >
          Crop Guides
        </button>
        <div className="rounded-md border border-[color:var(--panel-border)] px-2 py-1 text-xs text-[var(--text-soft)]">
          Internal Tool
        </div>
        <button
          type="button"
          className="btn-secondary h-7 w-7 p-0 text-xs font-bold"
          onClick={() => setShowShortcuts(true)}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </header>
  );
}
