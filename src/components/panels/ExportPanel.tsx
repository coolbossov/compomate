'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import {
  useExportProfile,
  useNameStyle,
  useShowSafeArea,
  useFirstName,
  useLastName,
  useComposition,
  useBatchItems,
  useActiveBackdrop,
  useActiveSubject,
  useFontPair,
  useJobName,
  useExportCounter,
  useApprovalGiven,
  useLockSettings,
  useNameOverlayEnabled,
  useNameSizePct,
  useNameYFromBottomPct,
  useQueueSummary,
} from '@/lib/store/selectors';
import {
  EXPORT_PROFILES,
  NAME_STYLE_OPTIONS,
  type ExportProfileId,
  type NameStyleId,
} from '@/lib/shared/composition';
import { makeId, parseErrorText } from '@/lib/client/utils';
import {
  EXPORT_TOAST_DURATION_MS,
  buildExportFilename,
  DEFAULT_JOB_NAME,
} from '@/lib/constants';
import type { BatchItem } from '@/types/export';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert any URL (blob: or data:) to a base64 data URL. */
async function toDataUrl(objectUrl: string): Promise<string> {
  if (objectUrl.startsWith('data:')) return objectUrl;
  const res = await fetch(objectUrl);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Inline toggle (used only in this panel)
// ---------------------------------------------------------------------------

function ToggleControl({
  label,
  checked = false,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--brand-primary)]"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Status icon for batch items
// ---------------------------------------------------------------------------

type BatchStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

function StatusIcon({ status, error }: { status: BatchStatus; error?: string }) {
  if (status === 'done')
    return <span className="text-green-400 font-bold text-sm">✓</span>;
  if (status === 'running')
    return <span className="text-blue-400 animate-pulse text-sm font-bold">●</span>;
  if (status === 'pending')
    return <span className="text-gray-400 text-sm">○</span>;
  if (status === 'failed')
    return (
      <span
        className="text-red-400 text-sm font-bold cursor-help"
        title={error ?? 'Failed'}
      >
        ✗
      </span>
    );
  if (status === 'cancelled')
    return <span className="text-gray-500 text-sm">—</span>;
  return null;
}

// ---------------------------------------------------------------------------
// ExportPanel
// ---------------------------------------------------------------------------

export function ExportPanel() {
  const exportProfileId = useExportProfile();
  const nameStyleId = useNameStyle();
  const showSafeArea = useShowSafeArea();
  const firstName = useFirstName();
  const lastName = useLastName();
  const composition = useComposition();
  const batchItems = useBatchItems();
  const activeBackdrop = useActiveBackdrop();
  const activeSubject = useActiveSubject();
  const fontPairId = useFontPair();
  const jobName = useJobName();
  const exportCounter = useExportCounter();
  const approvalGiven = useApprovalGiven();
  const lockSettings = useLockSettings();
  const nameOverlayEnabled = useNameOverlayEnabled();
  const nameSizePct = useNameSizePct();
  const nameYFromBottomPct = useNameYFromBottomPct();
  const queueSummary = useQueueSummary();

  const backdrops = useStore((s) => s.backdrops);
  const subjects = useStore((s) => s.subjects);
  const setExportProfile = useStore((s) => s.setExportProfile);
  const setNameStyle = useStore((s) => s.setNameStyle);
  const setShowSafeArea = useStore((s) => s.setShowSafeArea);
  const setJobName = useStore((s) => s.setJobName);
  const addBatchItem = useStore((s) => s.addBatchItem);
  const updateBatchItem = useStore((s) => s.updateBatchItem);
  const clearBatch = useStore((s) => s.clearBatch);
  const setApprovalGiven = useStore((s) => s.setApprovalGiven);
  const incrementExportCounter = useStore((s) => s.incrementExportCounter);
  const setLockSettings = useStore((s) => s.setLockSettings);
  const showToast = useStore((s) => s.showToast);

  const [isExporting, setIsExporting] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const batchAbortRef = useRef(false);
  const batchRequestAbortRef = useRef<AbortController | null>(null);

  const activeProfile = EXPORT_PROFILES[exportProfileId];

  // Live file naming preview (index = exportCounter + 1 for next export)
  const filenamePreview = buildExportFilename(
    jobName || DEFAULT_JOB_NAME,
    firstName || 'First',
    lastName || 'Last',
    exportCounter + 1,
  );

  // ---------------------------------------------------------------------------
  // Single export
  // ---------------------------------------------------------------------------

  const handleExport = useCallback(async (): Promise<void> => {
    if (!activeBackdrop || !activeSubject) return;
    setIsExporting(true);
    try {
      const [subjectDataUrl, backdropDataUrl] = await Promise.all([
        toDataUrl(activeSubject.objectUrl),
        (activeBackdrop as { r2Key?: string }).r2Key
          ? Promise.resolve(undefined)
          : toDataUrl(activeBackdrop.objectUrl),
      ]);

      const body = {
        subjectR2Key: undefined,
        subjectDataUrl,
        backdropR2Key: (activeBackdrop as { r2Key?: string }).r2Key,
        backdropDataUrl,
        composition,
        exportProfileId,
        nameOverlay: {
          firstName,
          lastName,
          style: nameStyleId,
          fontPairId,
          enabled: nameOverlayEnabled,
          sizePct: nameSizePct,
          yFromBottomPct: nameYFromBottomPct,
        },
        jobName: jobName || DEFAULT_JOB_NAME,
        firstName,
        lastName,
        index: exportCounter + 1,
      };

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(parseErrorText(await res.text()));

      const { filename, downloadUrl } = (await res.json()) as {
        filename: string;
        downloadUrl: string;
        width: number;
        height: number;
      };

      incrementExportCounter();
      showToast(filename);
      toast(filename, { duration: EXPORT_TOAST_DURATION_MS });

      // Trigger download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.click();

      // Approval gate: show once after first successful export
      if (exportCounter === 0 && !approvalGiven) {
        setApprovalDialogOpen(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed.';
      showToast(message);
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }, [
    activeBackdrop,
    activeSubject,
    composition,
    exportProfileId,
    firstName,
    lastName,
    nameStyleId,
    fontPairId,
    nameOverlayEnabled,
    nameSizePct,
    nameYFromBottomPct,
    jobName,
    exportCounter,
    approvalGiven,
    incrementExportCounter,
    showToast,
    setApprovalDialogOpen,
  ]);

  // Listen for keyboard shortcut Cmd+E (compomate:export)
  useEffect(() => {
    const handler = () => { void handleExport(); };
    window.addEventListener('compomate:export', handler);
    return () => window.removeEventListener('compomate:export', handler);
  }, [handleExport]);

  // ---------------------------------------------------------------------------
  // Batch helpers
  // ---------------------------------------------------------------------------

  function queuePair(
    backdropId: string,
    subjectId: string,
    backdropName: string,
    subjectName: string,
  ): void {
    const item: BatchItem = {
      id: makeId(),
      label: `${backdropName} + ${subjectName}`,
      backdropId,
      subjectId,
      firstName,
      lastName,
      composition: { ...composition },
      exportProfile: exportProfileId,
      nameStyle: nameStyleId,
      fontPairId,
      status: 'pending',
    };
    addBatchItem(item);
  }

  function queueCurrentPair(): void {
    if (!activeBackdrop || !activeSubject) return;
    queuePair(activeBackdrop.id, activeSubject.id, activeBackdrop.name, activeSubject.name);
  }

  function queueSubjectAcrossBackdrops(): void {
    if (!activeSubject || backdrops.length === 0) return;
    for (const b of backdrops) queuePair(b.id, activeSubject.id, b.name, activeSubject.name);
  }

  function queueAllSubjectsOnBackdrop(): void {
    if (!activeBackdrop || subjects.length === 0) return;
    for (const s of subjects) queuePair(activeBackdrop.id, s.id, activeBackdrop.name, s.name);
  }

  async function runBatchExport(): Promise<void> {
    if (isBatchRunning) return;

    const queue = batchItems.filter((i) => i.status === 'pending' || i.status === 'failed');
    if (queue.length === 0) return;

    batchAbortRef.current = false;
    setIsBatchRunning(true);
    const zip = new JSZip();
    let exportedCount = 0;
    let batchIndex = exportCounter;

    try {
      for (const item of queue) {
        if (batchAbortRef.current) {
          for (const b of batchItems) {
            if (b.status === 'running' || b.status === 'pending') {
              updateBatchItem(b.id, { status: 'cancelled', error: 'Cancelled by user.' });
            }
          }
          break;
        }

        updateBatchItem(item.id, { status: 'running', error: undefined });

        const backdrop = backdrops.find((a) => a.id === item.backdropId);
        const subject = subjects.find((a) => a.id === item.subjectId);

        if (!backdrop || !subject) {
          updateBatchItem(item.id, { status: 'failed', error: 'Source asset missing.' });
          continue;
        }

        try {
          const [subjectDataUrl, backdropDataUrl] = await Promise.all([
            toDataUrl(subject.objectUrl),
            (backdrop as { r2Key?: string }).r2Key
              ? Promise.resolve(undefined)
              : toDataUrl(backdrop.objectUrl),
          ]);

          batchIndex += 1;

          const body = {
            subjectR2Key: undefined,
            subjectDataUrl,
            backdropR2Key: (backdrop as { r2Key?: string }).r2Key,
            backdropDataUrl,
            composition: item.composition,
            exportProfileId: item.exportProfile,
            nameOverlay: {
              firstName: item.firstName,
              lastName: item.lastName,
              style: item.nameStyle,
              fontPairId: item.fontPairId,
              enabled: nameOverlayEnabled,
              sizePct: nameSizePct,
              yFromBottomPct: nameYFromBottomPct,
            },
            jobName: jobName || DEFAULT_JOB_NAME,
            firstName: item.firstName,
            lastName: item.lastName,
            index: batchIndex,
          };

          const controller = new AbortController();
          batchRequestAbortRef.current = controller;

          const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          batchRequestAbortRef.current = null;

          if (!response.ok) throw new Error(parseErrorText(await response.text()));

          const { filename, downloadUrl } = (await response.json()) as {
            filename: string;
            downloadUrl: string;
          };

          // Fetch binary for ZIP
          let arrayBuffer: ArrayBuffer;
          if (downloadUrl.startsWith('data:')) {
            const base64 = downloadUrl.split(',')[1] ?? '';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            arrayBuffer = bytes.buffer;
          } else {
            const imgRes = await fetch(downloadUrl);
            arrayBuffer = await imgRes.arrayBuffer();
          }

          zip.file(filename, arrayBuffer);
          exportedCount += 1;
          incrementExportCounter();
          updateBatchItem(item.id, { status: 'done', exportedFilename: filename });

          // Approval gate after first batch export
          if (exportCounter === 0 && exportedCount === 1 && !approvalGiven) {
            setApprovalDialogOpen(true);
            // Continue running — approval dialog is non-blocking for batch
          }
        } catch (error) {
          batchRequestAbortRef.current = null;
          const message =
            error instanceof DOMException && error.name === 'AbortError'
              ? 'Cancelled by user.'
              : error instanceof Error
                ? error.message
                : 'Batch export failed.';
          updateBatchItem(item.id, { status: 'failed', error: message });
        }
      }

      if (exportedCount > 0) {
        const bundle = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(bundle);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${jobName || DEFAULT_JOB_NAME}-batch-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsBatchRunning(false);
      batchAbortRef.current = false;
      batchRequestAbortRef.current = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Queue Summary Bar */}
      {batchItems.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs">
          <span className="text-green-400 font-semibold">✓ {queueSummary.done}</span>
          <span className="text-blue-400 animate-pulse font-semibold">● {queueSummary.running}</span>
          <span className="text-gray-400 font-semibold">○ {queueSummary.pending}</span>
          <span className="text-red-400 font-semibold">✗ {queueSummary.failed}</span>
        </div>
      )}

      {/* Export settings */}
      <section className="space-y-3">
        <h2 className="panel-title">Export</h2>

        {/* Job Name */}
        <label className="space-y-2 text-xs text-[var(--text-soft)]">
          <span>Job name</span>
          <input
            type="text"
            className="input"
            value={jobName}
            placeholder={DEFAULT_JOB_NAME}
            onChange={(e) => setJobName(e.target.value)}
          />
        </label>

        <label className="space-y-2 text-xs text-[var(--text-soft)]">
          <span>Name style</span>
          <select
            className="input"
            value={nameStyleId}
            onChange={(e) => setNameStyle(e.target.value as NameStyleId)}
          >
            {NAME_STYLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-xs text-[var(--text-soft)]">
          <span>Export profile</span>
          <select
            className="input"
            value={exportProfileId}
            onChange={(e) => setExportProfile(e.target.value as ExportProfileId)}
          >
            {Object.values(EXPORT_PROFILES).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <ToggleControl label="Show safe area overlay" checked={showSafeArea} onChange={setShowSafeArea} />

        {/* Lock Settings Toggle */}
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[color:var(--panel-border)] bg-white/2 px-3 py-2 text-xs text-[var(--text-primary)]">
          {lockSettings ? (
            <Lock className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          ) : (
            <Unlock className="h-3.5 w-3.5 text-[var(--text-soft)]" />
          )}
          <span className={lockSettings ? 'text-[var(--brand-primary)] font-medium' : ''}>
            Lock Settings
          </span>
          <Switch
            className="ml-auto"
            checked={lockSettings}
            onCheckedChange={(v: boolean) => setLockSettings(v)}
          />
        </label>

        <p className="text-xs text-[var(--text-soft)]">{activeProfile.description}</p>

        {/* File naming preview */}
        <p className="truncate rounded bg-white/4 px-2 py-1 font-mono text-[10px] text-[var(--text-soft)]">
          {filenamePreview}
        </p>

        <button
          className="btn-primary w-full"
          type="button"
          onClick={() => { void handleExport(); }}
          disabled={isExporting || !activeBackdrop || !activeSubject}
        >
          {isExporting ? 'Exporting…' : 'Export Final PNG'}
        </button>
      </section>

      {/* Batch queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Batch Queue</h2>
          <span className="panel-meta">{batchItems.length}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button className="btn-secondary" type="button" onClick={queueCurrentPair}>
            Queue Pair
          </button>
          <button className="btn-secondary" type="button" onClick={queueSubjectAcrossBackdrops}>
            Subject x All
          </button>
          <button className="btn-secondary" type="button" onClick={queueAllSubjectsOnBackdrop}>
            Backdrop x All
          </button>
        </div>

        <div className="asset-list max-h-44">
          {batchItems.map((item) => (
            <div key={item.id} className="asset-item">
              <StatusIcon status={item.status as BatchStatus} error={item.error} />
              <div className="min-w-0 flex-1 pl-1">
                <p className="truncate text-[11px]">{item.label}</p>
                {item.error && (
                  <p className="text-[10px] text-red-400 truncate">{item.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-primary"
            type="button"
            onClick={() => { void runBatchExport(); }}
            disabled={isBatchRunning || batchItems.length === 0}
          >
            {isBatchRunning ? 'Running…' : 'Run Batch'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              if (isBatchRunning) {
                batchAbortRef.current = true;
                batchRequestAbortRef.current?.abort();
                return;
              }
              clearBatch();
            }}
          >
            {isBatchRunning ? 'Cancel' : 'Clear'}
          </button>
        </div>
      </section>

      {/* Approval Gate Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>First export complete</DialogTitle>
            <DialogDescription>
              Does the result look correct? Review the downloaded file before continuing the batch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApprovalDialogOpen(false);
                batchAbortRef.current = true;
                batchRequestAbortRef.current?.abort();
              }}
            >
              Stop &amp; adjust
            </Button>
            <Button
              onClick={() => {
                setApprovalGiven(true);
                setApprovalDialogOpen(false);
              }}
            >
              Looks good, continue batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
