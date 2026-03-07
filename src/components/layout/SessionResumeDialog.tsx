'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { loadSession } from '@/lib/client/sessionStorage';
import { useStore } from '@/lib/store';
import type { SessionSettings } from '@/types/session';

const SESSION_MAX_AGE_MS = 86_400_000; // 24 hours

type ResumeDialogState = {
  show: boolean;
  session: SessionSettings | null;
};

function getInitialDialogState(): ResumeDialogState {
  if (typeof window === 'undefined') {
    return { show: false, session: null };
  }

  const saved = loadSession();
  if (saved && saved.jobName && Date.now() - saved.savedAt < SESSION_MAX_AGE_MS) {
    return { show: true, session: saved };
  }

  return { show: false, session: null };
}

export function SessionResumeDialog() {
  const [{ show, session }, setDialogState] = useState<ResumeDialogState>(getInitialDialogState);
  const setJobName = useStore((s) => s.setJobName);

  if (!show || !session) return null;

  const savedTime = new Date(session.savedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => setDialogState((current) => ({ ...current, show: open }))}
    >
      <DialogContent className="max-w-sm bg-[var(--panel-bg)] border-[var(--panel-border)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">Resume last session?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[#C9BEFF]">
          Found session <strong className="text-[var(--text-primary)]">{session.jobName}</strong>{' '}
          from {savedTime}.
        </p>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="border-[var(--panel-border)] text-[var(--text-soft)] hover:text-[var(--text-primary)]"
            onClick={() => setDialogState((current) => ({ ...current, show: false }))}
          >
            Start fresh
          </Button>
          <Button
            className="bg-[#6367FF] hover:bg-[#7478FF] text-white"
            onClick={() => {
              setJobName(session.jobName);
              setDialogState((current) => ({ ...current, show: false }));
            }}
          >
            Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
