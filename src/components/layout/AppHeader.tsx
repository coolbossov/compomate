'use client';

import { Redo2, Settings, Undo2 } from 'lucide-react';
import { redo, undo, useStore } from '@/lib/store';
import {
  useCanRedo,
  useCanUndo,
  useRedoCount,
  useShowDangerZone,
  useShowSideBySide,
  useUndoCount,
} from '@/lib/store/selectors';

export type Workspace = 'composite' | 'background-studio';

interface AppHeaderProps {
  workspace: Workspace;
  onWorkspaceChange: (workspace: Workspace) => void;
}

export function AppHeader({ workspace, onWorkspaceChange }: AppHeaderProps) {
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
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[color:var(--panel-border)] px-5 py-2 flex-shrink-0">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide">CompoMate</p>
          <p className="text-xs text-[var(--text-soft)]">Composite production workstation</p>
        </div>
        <nav className="flex rounded-lg border border-[color:var(--panel-border)] bg-black/20 p-0.5" aria-label="Workspace">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs transition-colors ${workspace === 'composite' ? 'bg-[#5558df] text-white' : 'text-[var(--text-soft)] hover:text-white'}`}
            onClick={() => onWorkspaceChange('composite')}
            aria-current={workspace === 'composite' ? 'page' : undefined}
          >
            Composite
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs transition-colors ${workspace === 'background-studio' ? 'bg-[#5558df] text-white' : 'text-[var(--text-soft)] hover:text-white'}`}
            onClick={() => onWorkspaceChange('background-studio')}
            aria-current={workspace === 'background-studio' ? 'page' : undefined}
          >
            Background Studio
          </button>
        </nav>
        {workspace === 'composite' && (
          <input
            className="input h-7 w-48 text-xs"
            placeholder="Job name"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            aria-label="Job name"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {workspace === 'composite' && <button
          type="button"
          className="btn-secondary h-7 w-7 p-0"
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label="Undo"
          title={canUndo ? `Undo (${undoCount} available)` : 'Undo'}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>}
        {workspace === 'composite' && <button
          type="button"
          className="btn-secondary h-7 w-7 p-0"
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label="Redo"
          title={canRedo ? `Redo (${redoCount} available)` : 'Redo'}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>}
        {workspace === 'composite' && <button
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
        </button>}
        {workspace === 'composite' && <button
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
        </button>}
        <details className="group relative">
          <summary className="btn-secondary flex h-7 cursor-pointer list-none items-center gap-1.5 px-2 text-xs" title="Application settings">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </summary>
          <div className="absolute right-0 top-9 z-50 w-56 rounded-xl border border-[color:var(--panel-border)] bg-[var(--panel-bg)] p-3 shadow-2xl">
            <p className="text-xs font-semibold text-white">Application settings</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--text-soft)]">Shared editor preferences and help live here.</p>
            {workspace === 'composite' && (
              <div className="mt-3 space-y-2">
                <button type="button" className="btn-secondary w-full text-left" onClick={() => setShowSideBySide(!showSideBySide)}>Compare view: {showSideBySide ? 'On' : 'Off'}</button>
                <button type="button" className="btn-secondary w-full text-left" onClick={() => setShowDangerZone(!showDangerZone)}>Crop guides: {showDangerZone ? 'On' : 'Off'}</button>
              </div>
            )}
            <button type="button" className="btn-secondary mt-2 w-full text-left" onClick={() => setShowShortcuts(true)}>Keyboard shortcuts</button>
            <div className="mt-3 rounded-md border border-[color:var(--panel-border)] px-2 py-1 text-[10px] text-[var(--text-soft)]">Internal Tool</div>
          </div>
        </details>
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
