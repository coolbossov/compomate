'use client';

import { useRef } from 'react';
import Papa from 'papaparse';
import { Upload, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { captureEvent } from '@/lib/client/posthog';

/**
 * RosterImportPanel
 *
 * Compact row placed in FilePanel, below the Add Files / Add Folder buttons.
 * Parses a CSV with columns FirstName,LastName (case-insensitive) and loads
 * it into the roster queue. Handles quoted fields, BOM headers, commas in
 * names, and tab-separated exports from school software.
 * The queue is consumed sequentially: one entry per subject advance.
 */
export function RosterImportPanel() {
  const rosterQueue = useStore((s) => s.rosterQueue);
  const loadRoster = useStore((s) => s.loadRoster);
  const clearRoster = useStore((s) => s.clearRoster);
  const showToast = useStore((s) => s.showToast);

  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''), // strip BOM
      complete(results) {
        const headers = results.meta.fields ?? [];

        // Case-insensitive column lookup
        const find = (candidates: string[]) =>
          headers.find((h) =>
            candidates.some((c) => h.toLowerCase().replace(/\s+/g, '') === c.toLowerCase()),
          ) ?? null;

        const firstCol = find(['firstname', 'first_name', 'first']);
        const lastCol = find(['lastname', 'last_name', 'last']);

        const rows = results.data
          .map((row) => ({
            firstName: firstCol ? (row[firstCol] ?? '').trim() : '',
            lastName: lastCol ? (row[lastCol] ?? '').trim() : '',
          }))
          .filter((r) => r.firstName || r.lastName);

        const skipped = results.data.length - rows.length;

        if (rows.length === 0) {
          showToast('No valid rows found. Expected columns: FirstName, LastName.', 5000, 'error');
          return;
        }

        loadRoster(rows);
        captureEvent('roster_loaded', { count: rows.length, skipped });
        const msg =
          skipped > 0
            ? `Roster loaded: ${rows.length} athletes, ${skipped} rows skipped`
            : `Roster loaded: ${rows.length} athletes`;
        showToast(msg, 3000, 'success');
      },
      error(err) {
        showToast(`CSV parse error: ${err.message}`, 5000, 'error');
      },
    });

    // Reset so the same file can be re-imported without a page reload
    e.target.value = '';
  }

  const hasRoster = rosterQueue.length > 0;

  return (
    <div className="flex items-center gap-2">
      {/* Hidden file input — triggered programmatically */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <button
        type="button"
        className="btn-secondary flex flex-1 items-center justify-center gap-1.5 text-xs"
        onClick={() => inputRef.current?.click()}
        title={hasRoster ? 'Replace roster CSV' : 'Import roster CSV (FirstName,LastName)'}
      >
        <Upload className="h-3 w-3 shrink-0" aria-hidden="true" />
        {hasRoster ? (
          <span>
            Roster <span className="text-[var(--brand-warm)]">({rosterQueue.length} left)</span>
          </span>
        ) : (
          'Import Roster'
        )}
      </button>

      {hasRoster && (
        <button
          type="button"
          className="asset-remove hover:text-red-400 hover:border-red-400/50"
          onClick={clearRoster}
          title="Clear roster queue"
          aria-label="Clear roster"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
