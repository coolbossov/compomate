'use client';

import { useStore } from '@/lib/store';
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
  const showShortcuts = useStore((s) => s.showShortcuts);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  return (
    <Dialog
      open={showShortcuts}
      onOpenChange={(open: boolean) => {
        if (!open) setShowShortcuts(false);
      }}
    >
      <DialogContent
        className="w-full max-w-md bg-[#13131A] text-[var(--text-primary)] ring-1 ring-[#2A2A38]"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 pt-1">
          {SHORTCUTS.map((shortcut, i) => {
            const mods = shortcut.modifiers ?? [];
            const modBadges = mods.map((m) => MOD_LABELS[m] ?? m);
            const keyLabel = KEY_LABELS[shortcut.key] ?? shortcut.key;
            const allKeys = [...modBadges, keyLabel];

            return (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="contents"
              >
                <span className="self-center text-xs text-[var(--text-soft)]">
                  {shortcut.description}
                </span>
                <div className="flex items-center gap-1 justify-end">
                  {allKeys.map((k, ki) => (
                    <kbd
                      // eslint-disable-next-line react/no-array-index-key
                      key={ki}
                      style={{
                        background: '#2A2A38',
                        border: '1px solid #3A3A4A',
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
