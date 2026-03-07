'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { loadSession, saveSession, clearSession } from '@/lib/client/sessionStorage';
import { useStore } from '@/lib/store';
import type { SessionSettings } from '@/types/session';
import { DEFAULT_JOB_NAME } from '@/lib/constants';

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
  const setExportProfile = useStore((s) => s.setExportProfile);
  const setNameStyle = useStore((s) => s.setNameStyle);
  const setFontPair = useStore((s) => s.setFontPair);
  const setLockSettings = useStore((s) => s.setLockSettings);
  const jobName = useStore((s) => s.jobName);
  const activeBackdropId = useStore((s) => s.activeBackdropId);
  const exportProfileId = useStore((s) => s.exportProfileId);
  const nameStyleId = useStore((s) => s.nameStyleId);
  const fontPairId = useStore((s) => s.fontPairId);
  const lockSettings = useStore((s) => s.lockSettings);

  useEffect(() => {
    const settings: SessionSettings = {
      jobName,
      lastBackdropId: activeBackdropId ?? undefined,
      lastExportProfile: exportProfileId,
      lastNameStyle: nameStyleId,
      lastFontPairId: fontPairId,
      lockSettings,
      savedAt: Date.now(),
    };

    const hasMeaningfulSession =
      settings.jobName.trim() !== '' && settings.jobName.trim() !== DEFAULT_JOB_NAME;

    if (hasMeaningfulSession) {
      saveSession(settings);
      return;
    }

    clearSession();
  }, [jobName, activeBackdropId, exportProfileId, nameStyleId, fontPairId, lockSettings]);

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
          <DialogDescription className="text-sm text-[#C9BEFF]">
            Your workspace settings were already restored automatically. Keep them, or clear the saved session and start fresh.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-[#C9BEFF]">
          Found session <strong className="text-[var(--text-primary)]">{session.jobName}</strong>{' '}
          from {savedTime}.
        </p>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="border-[var(--panel-border)] text-[var(--text-soft)] hover:text-[var(--text-primary)]"
            onClick={() => {
              clearSession();
              void useStore.persist.clearStorage();
              window.location.reload();
            }}
          >
            Start fresh
          </Button>
          <Button
            className="bg-[#6367FF] hover:bg-[#7478FF] text-white"
            onClick={() => {
              setJobName(session.jobName);
              setExportProfile(session.lastExportProfile);
              setNameStyle(session.lastNameStyle);
              setFontPair(session.lastFontPairId);
              setLockSettings(session.lockSettings);
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
