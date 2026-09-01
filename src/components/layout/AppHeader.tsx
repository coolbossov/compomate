'use client';

import { Redo2, Settings, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    <header className="flex min-h-[52px] flex-nowrap items-center justify-between gap-2 border-b border-[color:var(--panel-border)] bg-white px-3 py-1.5 sm:px-4 flex-shrink-0" data-testid="app-header">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[var(--brand-primary)] ring-1 ring-[#e6a9e0]" aria-hidden="true" />
          <p className="hidden text-sm font-semibold tracking-tight sm:block">CompoMate</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Workspace">
          <button
            type="button"
            className={`rounded-md border-b-2 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${workspace === 'composite' ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-soft)] hover:bg-[#faf0f9] hover:text-[var(--text-primary)]'}`}
            onClick={() => onWorkspaceChange('composite')}
            aria-current={workspace === 'composite' ? 'page' : undefined}
          >
            Composite
          </button>
          <button
            type="button"
            className={`rounded-md border-b-2 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${workspace === 'background-studio' ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-soft)] hover:bg-[#faf0f9] hover:text-[var(--text-primary)]'}`}
            onClick={() => onWorkspaceChange('background-studio')}
            aria-current={workspace === 'background-studio' ? 'page' : undefined}
          >
            Background Studio
          </button>
        </nav>
        {workspace === 'composite' && (
          <input
            className="input hidden h-7 w-48 text-xs md:block"
            placeholder="Job name"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            aria-label="Job name"
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {workspace === 'composite' && <button
          type="button"
          className="btn-secondary hidden h-7 w-7 p-0 md:flex"
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label="Undo"
          title={canUndo ? `Undo (${undoCount} available)` : 'Undo'}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>}
        {workspace === 'composite' && <button
          type="button"
          className="btn-secondary hidden h-7 w-7 p-0 md:flex"
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label="Redo"
          title={canRedo ? `Redo (${redoCount} available)` : 'Redo'}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>}
        {workspace === 'composite' && <button
          type="button"
          className={`btn-secondary hidden h-7 px-2 text-xs md:flex ${
            showSideBySide
              ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--text-primary)]'
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
          className={`btn-secondary hidden h-7 px-2 text-xs md:flex ${
            showDangerZone
              ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary)] text-[var(--text-primary)]'
              : ''
          }`}
          onClick={() => setShowDangerZone(!showDangerZone)}
          aria-pressed={showDangerZone}
          title="Toggle crop guides"
        >
          Crop Guides
        </button>}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="btn-secondary flex h-7 items-center gap-1.5 px-2 text-xs"
            title="Application settings"
            aria-label="Application settings"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 border border-[color:var(--panel-border)] bg-[var(--panel-bg)] p-2 text-[var(--text-primary)] shadow-lg">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Application settings</DropdownMenuLabel>
              <p className="px-1.5 pb-2 text-[10px] leading-4 text-[var(--text-soft)]">Shared editor preferences and help live here.</p>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {workspace === 'composite' && (
              <>
                <DropdownMenuItem onClick={() => setShowSideBySide(!showSideBySide)}>Compare view: {showSideBySide ? 'On' : 'Off'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDangerZone(!showDangerZone)}>Crop guides: {showDangerZone ? 'On' : 'Off'}</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => setShowShortcuts(true)}>Keyboard shortcuts</DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-1.5 py-1 text-[10px] text-[var(--text-soft)]">Internal Tool</p>
          </DropdownMenuContent>
        </DropdownMenu>
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
