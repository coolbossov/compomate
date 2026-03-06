'use client';

import { useStore } from '@/lib/store';

export function AppHeader() {
  const jobName = useStore((s) => s.jobName);
  const setJobName = useStore((s) => s.setJobName);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

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
        <div className="rounded-md border border-[color:var(--panel-border)] px-2 py-1 text-xs text-[var(--text-soft)]">
          Phases 1-7 Build
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
