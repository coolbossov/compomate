'use client';

import { useStore } from '@/lib/store';
import { useShowShortcuts } from '@/lib/store/selectors';
import { SHORTCUTS } from '@/types/shortcuts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Map raw key names to readable display labels */
const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

const MOD_LABELS: Record<string, string> = {
  cmd: '⌘',
  shift: '⇧',
  alt: '⌥',
};

export function ShortcutsOverlay() {
  const showShortcuts = useShowShortcuts();
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  return (
    <Dialog
      open={showShortcuts}
      onOpenChange={(open: boolean) => {
        if (!open) setShowShortcuts(false);
      }}
    >
      <DialogContent
        className="w-full max-w-md bg-[var(--panel-bg)] text-[var(--text-primary)] ring-1 ring-[var(--panel-border)]"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 pt-1">
          {SHORTCUTS.map((shortcut) => {
            const mods = shortcut.modifiers ?? [];
            const modBadges = mods.map((m) => MOD_LABELS[m] ?? m);
            const keyLabel = KEY_LABELS[shortcut.key] ?? shortcut.key;
            const allKeys = [...modBadges, keyLabel];
            const shortcutKey = `${shortcut.key}-${shortcut.description}`;

            return (
              <div
                key={shortcutKey}
                className="contents"
              >
                <span className="self-center text-xs text-[var(--text-soft)]">
                  {shortcut.description}
                </span>
                <div className="flex items-center gap-1 justify-end">
                  {allKeys.map((k, ki) => (
                    <kbd
                      key={`${shortcutKey}-${k}-${ki}`}
                      style={{
                        background: '#f3f3f5',
                        border: '1px solid var(--panel-border)',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'var(--text-primary)',
                        lineHeight: '1.4',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
