'use client';

import { useStore } from '@/lib/store';
import {
  useFirstName,
  useLastName,
  useStickyLastName,
  useNameOverlayEnabled,
} from '@/lib/store/selectors';

export function NameEntryPanel() {
  const firstName = useFirstName();
  const lastName = useLastName();
  const stickyLastName = useStickyLastName();
  const nameOverlayEnabled = useNameOverlayEnabled();

  const setFirstName = useStore((s) => s.setFirstName);
  const setLastName = useStore((s) => s.setLastName);
  const setStickyLastName = useStore((s) => s.setStickyLastName);
  const setNameOverlayEnabled = useStore((s) => s.setNameOverlayEnabled);
  const pasteAutoSplit = useStore((s) => s.pasteAutoSplit);

  return (
    <section className="space-y-3">
      <h2 className="panel-title">Name</h2>

      <div className="space-y-2">
        <input
          className="input"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.trim().includes(' ')) {
              e.preventDefault();
              pasteAutoSplit(text);
            }
          }}
        />
        <input
          className="input"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--brand-primary)]"
          checked={stickyLastName}
          onChange={(e) => setStickyLastName(e.target.checked)}
        />
        <span>Sticky last name</span>
      </label>

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--brand-primary)]"
          checked={nameOverlayEnabled}
          onChange={(e) => setNameOverlayEnabled(e.target.checked)}
        />
        <span>Name overlay</span>
      </label>
    </section>
  );
}
