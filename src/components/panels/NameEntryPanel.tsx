'use client';

import { useRef, useEffect, useState } from 'react';
import { Pin, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  useFirstName,
  useLastName,
  useStickyLastName,
  useNameOverlayEnabled,
  useFontPair,
} from '@/lib/store/selectors';
import { Switch } from '@/components/ui/switch';

import { FONT_PAIRS } from '@/lib/constants';
import type { FontPairId } from '@/lib/constants';

export function NameEntryPanel() {
  const firstName = useFirstName();
  const lastName = useLastName();
  const stickyLastName = useStickyLastName();
  const nameOverlayEnabled = useNameOverlayEnabled();
  const fontPairId = useFontPair();

  const setFirstName = useStore((s) => s.setFirstName);
  const setLastName = useStore((s) => s.setLastName);
  const setStickyLastName = useStore((s) => s.setStickyLastName);
  const setNameOverlayEnabled = useStore((s) => s.setNameOverlayEnabled);
  const pasteAutoSplit = useStore((s) => s.pasteAutoSplit);
  const setFontPair = useStore((s) => s.setFontPair);
  const nextSubject = useStore((s) => s.nextSubject);
  const clearForNextFile = useStore((s) => s.clearForNextFile);
  const activeSubjectId = useStore((s) => s.activeSubjectId);

  // Refs for tab-flow between inputs
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);

  // Track subject changes and clear name fields (keeping lastName if sticky)
  const prevSubjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeSubjectId && activeSubjectId !== prevSubjectIdRef.current) {
      // Only clear when navigating away from an already-loaded file (not initial load)
      if (prevSubjectIdRef.current !== null) {
        clearForNextFile();
      }
      prevSubjectIdRef.current = activeSubjectId;
    }
  }, [activeSubjectId, clearForNextFile]);

  // Load font faces for preview
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    setFontsLoaded(false);
    const pair = FONT_PAIRS.find((p) => p.id === fontPairId);
    if (!pair) return;
    const f1 = new FontFace('PreviewFirst', `url(/fonts/${pair.firstNameFont})`);
    const f2 = new FontFace('PreviewLast', `url(/fonts/${pair.lastNameFont})`);
    Promise.all([f1.load(), f2.load()])
      .then(([loaded1, loaded2]) => {
        document.fonts.add(loaded1);
        document.fonts.add(loaded2);
        setFontsLoaded(true);
      })
      .catch(() => {
        // Font files may not exist in dev — preview falls back to system fonts
        setFontsLoaded(true); // Show with fallback rather than loading forever
      });
  }, [fontPairId]);

  function handleFirstNamePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').trim();
    if (text.includes(' ')) {
      e.preventDefault();
      pasteAutoSplit(text);
    }
  }

  function handleFirstNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      lastNameRef.current?.focus();
    }
  }

  function handleLastNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      nextSubject();
      // Focus first name after a short tick to allow re-render
      setTimeout(() => firstNameRef.current?.focus(), 0);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="panel-title">Name</h2>

      {/* Name inputs */}
      <div className="space-y-2">
        <input
          ref={firstNameRef}
          className="input"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onPaste={handleFirstNamePaste}
          onKeyDown={handleFirstNameKeyDown}
          aria-label="First name"
        />
        <input
          ref={lastNameRef}
          className={`input transition-colors ${stickyLastName ? 'border-[#6367FF]' : ''}`}
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          onKeyDown={handleLastNameKeyDown}
          aria-label="Last name"
        />
      </div>

      {/* Font preview */}
      <div className="mt-1 rounded bg-[#0D0D12] p-2 text-center min-h-[48px] flex items-center justify-center">
        {!fontsLoaded ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-soft)]" />
        ) : (
          <>
            <span style={{ fontFamily: 'PreviewFirst', fontSize: 20, color: '#fff' }}>
              {firstName || 'First'}{' '}
            </span>
            <span
              style={{
                fontFamily: 'PreviewLast',
                fontSize: 16,
                color: '#C9BEFF',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {lastName || 'LAST'}
            </span>
          </>
        )}
      </div>

      {/* Font pair selector */}
      <div className="flex gap-1.5">
        {FONT_PAIRS.map((pair) => (
          <button
            key={pair.id}
            type="button"
            onClick={() => setFontPair(pair.id as FontPairId)}
            className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${
              fontPairId === pair.id
                ? 'border-[#6367FF] bg-[#6367FF]/15 text-[var(--text-primary)]'
                : 'border-[color:var(--panel-border)] bg-transparent text-[var(--text-soft)] hover:border-[#6367FF]/50'
            }`}
            aria-pressed={fontPairId === pair.id}
          >
            {pair.id === 'classic' ? 'Classic' : 'Modern'}
          </button>
        ))}
      </div>

      {/* Sticky last name toggle */}
      <label
        className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]"
        title="Keep last name when switching to next file"
      >
        <div className="flex items-center gap-2">
          {stickyLastName && (
            <Pin className="h-3 w-3 text-[#6367FF]" aria-hidden="true" />
          )}
          <span>Sticky last name</span>
        </div>
        <Switch
          size="sm"
          checked={stickyLastName}
          onCheckedChange={(checked: boolean) => setStickyLastName(checked)}
          aria-label="Sticky last name"
        />
      </label>

      {/* Name overlay toggle */}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
        <span>Name overlay</span>
        <Switch
          size="sm"
          checked={nameOverlayEnabled}
          onCheckedChange={(checked: boolean) => setNameOverlayEnabled(checked)}
          aria-label="Name overlay"
        />
      </label>
    </section>
  );
}
