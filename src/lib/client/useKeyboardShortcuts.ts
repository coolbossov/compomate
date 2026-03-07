'use client';
import { useEffect } from 'react';
import { useStore, undo, redo } from '@/lib/store';

export function useKeyboardShortcuts() {
  const nextSubject = useStore((s) => s.nextSubject);
  const prevSubject = useStore((s) => s.prevSubject);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inInput =
        tag === 'input' ||
        tag === 'textarea' ||
        (e.target as HTMLElement)?.isContentEditable;

      // [ ] file navigation — keep arrow keys dedicated to canvas nudging.
      if (!inInput && !cmdOrCtrl && !e.shiftKey) {
        if (e.key === '[') {
          e.preventDefault();
          prevSubject();
          return;
        }
        if (e.key === ']') {
          e.preventDefault();
          nextSubject();
          return;
        }
      }

      // Cmd/Ctrl+Z undo / Cmd/Ctrl+Shift+Z redo
      if (cmdOrCtrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Cmd/Ctrl+E export
      if (cmdOrCtrl && e.key === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('compomate:export'));
        return;
      }

      // Cmd/Ctrl+S save template
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('compomate:save-template'));
        return;
      }

      // ? shortcuts overlay — not in inputs
      if (e.key === '?' && !inInput) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSubject, prevSubject, setShowShortcuts]);
}
