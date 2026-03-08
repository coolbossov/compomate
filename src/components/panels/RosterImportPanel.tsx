'use client';

import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { useStore } from '@/lib/store';

/**
 * RosterImportPanel
 *
 * Compact row placed in FilePanel, below the Add Files / Add Folder buttons.
 * Parses a CSV with columns FirstName,LastName and loads it into the roster queue.
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

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split('\n').filter(Boolean);
      const rows = lines
        // Skip header row if the first column looks like "firstname"
        .filter((l) => !/^"?firstname"?/i.test(l.split(',')[0]))
        .map((l) => {
          const parts = l.split(',');
          const firstName = (parts[0] ?? '').trim().replace(/^"|"$/g, '');
          const lastName = (parts[1] ?? '').trim().replace(/^"|"$/g, '');
          return { firstName, lastName };
        })
        .filter((r) => r.firstName || r.lastName);

      if (rows.length === 0) {
        showToast('No valid rows found in CSV.', 4000, 'error');
        return;
      }

      loadRoster(rows);
      showToast(`Roster loaded: ${rows.length} athletes`, 3000, 'success');
    };

    reader.readAsText(file);
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
