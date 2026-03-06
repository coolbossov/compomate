'use client';

import { useStore } from '@/lib/store';
import { SHORTCUTS } from '@/types/shortcuts';

export function ShortcutsOverlay() {
  const showShortcuts = useStore((s) => s.showShortcuts);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  if (!showShortcuts) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={() => setShowShortcuts(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="panel w-96 space-y-3 rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="panel-title text-base">Keyboard Shortcuts</h2>
          <button
            type="button"
            className="btn-secondary h-7 w-7 p-0 text-xs"
            onClick={() => setShowShortcuts(false)}
            aria-label="Close shortcuts panel"
          >
            ✕
          </button>
        </div>

        <ul className="space-y-2">
          {SHORTCUTS.map((shortcut, i) => {
            const mods = shortcut.modifiers ?? [];
            const keys = [
              ...mods.map((m) => ({ cmd: '⌘', shift: '⇧', alt: '⌥' }[m] ?? m)),
              shortcut.key,
            ].join(' ');
            return (
              <li
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-[var(--text-soft)]">{shortcut.description}</span>
                <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-[var(--text-primary)]">
                  {keys}
                </kbd>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
