'use client';

import { useRef, useState } from 'react';
import JSZip from 'jszip';
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
} from '@/lib/store/selectors';
import {
  EXPORT_PROFILES,
  NAME_STYLE_OPTIONS,
  type ExportProfileId,
  type NameStyleId,
} from '@/lib/shared/composition';
import {
  makeId,
  parseErrorText,
  prepareExportPayload,
  buildDownloadFilename,
} from '@/lib/client/utils';
import type { BatchItem } from '@/types/export';

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

  const backdrops = useStore((s) => s.backdrops);
  const subjects = useStore((s) => s.subjects);
  const setExportProfile = useStore((s) => s.setExportProfile);
  const setNameStyle = useStore((s) => s.setNameStyle);
  const setShowSafeArea = useStore((s) => s.setShowSafeArea);
  const addBatchItem = useStore((s) => s.addBatchItem);
  const updateBatchItem = useStore((s) => s.updateBatchItem);
  const clearBatch = useStore((s) => s.clearBatch);

  const [isExporting, setIsExporting] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const batchAbortRef = useRef(false);
  const batchRequestAbortRef = useRef<AbortController | null>(null);

  const activeProfile = EXPORT_PROFILES[exportProfileId];

  // ---------------------------------------------------------------------------
  // Single export
  // ---------------------------------------------------------------------------

  async function onExport(): Promise<void> {
    if (!activeBackdrop || !activeSubject) return;
    setIsExporting(true);
    try {
      const optimized = await prepareExportPayload(
        activeBackdrop.objectUrl,
        activeSubject.objectUrl,
        exportProfileId,
      );
      if (optimized.totalBytes > 4_200_000) {
        throw new Error('Images are still too large for cloud export. Choose a smaller profile or lower source resolution.');
      }

      const formData = new FormData();
      formData.append('backdrop', optimized.backdropBlob, 'backdrop.jpg');
      formData.append('subject', optimized.subjectBlob, 'subject.webp');
      formData.append('composition', JSON.stringify(composition));
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('exportProfile', exportProfileId);
      formData.append('nameStyle', nameStyleId);

      const response = await fetch('/api/export', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(parseErrorText(await response.text()));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildDownloadFilename(firstName, lastName, exportProfileId);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // errors silently dropped; status is managed at page level
    } finally {
      setIsExporting(false);
    }
  }

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
          const optimized = await prepareExportPayload(
            backdrop.objectUrl,
            subject.objectUrl,
            item.exportProfile,
          );
          if (optimized.totalBytes > 4_200_000) {
            throw new Error('Item too large for cloud export.');
          }

          const formData = new FormData();
          formData.append('backdrop', optimized.backdropBlob, 'backdrop.jpg');
          formData.append('subject', optimized.subjectBlob, 'subject.webp');
          formData.append('composition', JSON.stringify(item.composition));
          formData.append('firstName', item.firstName);
          formData.append('lastName', item.lastName);
          formData.append('exportProfile', item.exportProfile);
          formData.append('nameStyle', item.nameStyle);

          const controller = new AbortController();
          batchRequestAbortRef.current = controller;
          const response = await fetch('/api/export', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          batchRequestAbortRef.current = null;

          if (!response.ok) throw new Error(parseErrorText(await response.text()));

          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const safeLabel = item.label
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[^a-z0-9_-]+/gi, '_')
            .slice(0, 64);
          zip.file(`${safeLabel || item.id}.png`, arrayBuffer);
          exportedCount += 1;
          updateBatchItem(item.id, { status: 'done', error: undefined });
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
        anchor.download = `compomate_batch_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
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
      {/* Export settings */}
      <section className="space-y-3">
        <h2 className="panel-title">Export</h2>

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

        <p className="text-xs text-[var(--text-soft)]">{activeProfile.description}</p>

        <button
          className="btn-primary w-full"
          type="button"
          onClick={() => { void onExport(); }}
          disabled={isExporting || !activeBackdrop || !activeSubject}
        >
          {isExporting ? 'Exporting...' : 'Export Final PNG'}
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px]">{item.label}</p>
                <p className="text-[10px] text-[var(--text-soft)]">
                  {item.status}
                  {item.error ? ` - ${item.error}` : ''}
                </p>
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
            {isBatchRunning ? 'Running...' : 'Run Batch'}
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
    </div>
  );
}
