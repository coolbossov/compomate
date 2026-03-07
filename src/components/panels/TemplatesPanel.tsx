'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useStore } from '@/lib/store';
import { useComposition, useExportProfile, useNameStyle, useFontPair } from '@/lib/store/selectors';
import { parseErrorText } from '@/lib/client/utils';
import type { CompositionState, ExportProfileId, NameStyleId } from '@/lib/shared/composition';
import type { FontPairId } from '@/types/composition';

// ---------------------------------------------------------------------------
// API response shape (Supabase snake_case → our usage)
// ---------------------------------------------------------------------------

interface ApiTemplate {
  id: string;
  name: string;
  composition: CompositionState;
  export_profile_id: ExportProfileId | null;
  name_style_id: NameStyleId | null;
  font_pair_id: FontPairId | null;
  created_at: string;
  updated_at: string;
}

const compositionSchema = z.object({
  xPct: z.number(),
  yPct: z.number(),
  subjectHeightPct: z.number(),
  reflectionEnabled: z.boolean(),
  reflectionSizePct: z.number(),
  reflectionPositionPct: z.number(),
  reflectionOpacityPct: z.number(),
  reflectionBlurPx: z.number(),
  legFadeEnabled: z.boolean(),
  legFadeStartPct: z.number(),
  fogEnabled: z.boolean(),
  fogOpacityPct: z.number(),
  fogHeightPct: z.number(),
  shadowEnabled: z.boolean(),
  shadowStrengthPct: z.number(),
  lightDirectionDeg: z.number(),
  lightElevationDeg: z.number(),
  shadowStretchPct: z.number(),
  shadowBlurPx: z.number(),
});

const importedTemplateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  composition: compositionSchema,
  exportProfileId: z.enum(['original', '8x10', '5x7', '4x5', '1x1']).optional(),
  nameStyleId: z.enum(['classic', 'outline', 'modern']).optional(),
  fontPairId: z.enum(['classic', 'modern']).optional(),
  exportedAt: z.string().optional(),
});

type ImportedTemplate = z.infer<typeof importedTemplateSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplatesPanel() {
  const composition = useComposition();
  const exportProfileId = useExportProfile();
  const nameStyleId = useNameStyle();
  const fontPairId = useFontPair();

  const updateComposition = useStore((s) => s.updateComposition);
  const setExportProfile = useStore((s) => s.setExportProfile);
  const setNameStyle = useStore((s) => s.setNameStyle);
  const setFontPair = useStore((s) => s.setFontPair);
  const showToast = useStore((s) => s.showToast);

  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [supabaseReady, setSupabaseReady] = useState<boolean | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Load templates on mount
  // -------------------------------------------------------------------------

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      if (!res.ok) { const t = await res.text(); throw new Error(parseErrorText(t)); }
      const payload = (await res.json()) as { templates?: ApiTemplate[]; configured?: boolean };
      setTemplates(payload.templates ?? []);
      setSupabaseReady(payload.configured !== false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  // -------------------------------------------------------------------------
  // Cmd+S shortcut → open save dialog
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handler = () => setShowSaveDialog(true);
    window.addEventListener('compomate:save-template', handler);
    return () => window.removeEventListener('compomate:save-template', handler);
  }, []);

  // -------------------------------------------------------------------------
  // Save template
  // -------------------------------------------------------------------------

  async function saveTemplate(): Promise<void> {
    const name = newTemplateName.trim();
    if (!name) { showToast('Enter a template name.'); return; }
    if (supabaseReady === false) { showToast('Templates unavailable — Supabase not configured.'); return; }

    setIsSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          composition,
          exportProfileId,
          nameStyleId,
          fontPairId,
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(parseErrorText(t)); }
      showToast(`Template "${name}" saved.`);
      setShowSaveDialog(false);
      setNewTemplateName('');
      await loadTemplates();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Load template into store
  // -------------------------------------------------------------------------

  function applyTemplate(t: ApiTemplate): void {
    updateComposition(t.composition as Partial<CompositionState>);
    if (t.export_profile_id) setExportProfile(t.export_profile_id);
    if (t.name_style_id) setNameStyle(t.name_style_id);
    if (t.font_pair_id) setFontPair(t.font_pair_id);
    showToast(`Template "${t.name}" loaded.`);
  }

  // -------------------------------------------------------------------------
  // Delete template
  // -------------------------------------------------------------------------

  async function deleteTemplate(id: string, name: string): Promise<void> {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) { const t = await res.text(); throw new Error(parseErrorText(t)); }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast(`Template "${name}" deleted.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete template.');
    }
  }

  // -------------------------------------------------------------------------
  // Download template as JSON
  // -------------------------------------------------------------------------

  function downloadTemplate(t: ApiTemplate): void {
    const json = JSON.stringify(
      {
        name: t.name,
        composition: t.composition,
        exportProfileId: t.export_profile_id,
        nameStyleId: t.name_style_id,
        fontPairId: t.font_pair_id,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}-template.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Import template from JSON file
  // -------------------------------------------------------------------------

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new Error('Template import failed — file is not valid JSON.');
      }

      const parsed = importedTemplateSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Template import failed — invalid shape.');
      }

      applyImportedTemplate(parsed.data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to parse template file.');
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  function applyImportedTemplate(template: ImportedTemplate): void {
    updateComposition(template.composition);
    if (template.exportProfileId) {
      setExportProfile(template.exportProfileId);
    }
    if (template.nameStyleId) {
      setNameStyle(template.nameStyleId);
    }
    if (template.fontPairId) {
      setFontPair(template.fontPairId);
    }
    showToast(`Template "${template.name ?? 'Imported'}" loaded from file.`);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="space-y-3 p-4 border-t border-[color:var(--panel-border)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Templates</h2>
        <span className="panel-meta">{templates.length}</span>
      </div>

      {/* Actions row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary"
          type="button"
          onClick={() => setShowSaveDialog(true)}
          title="Save current settings as template (⌘S)"
        >
          Save Template
        </button>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => importInputRef.current?.click()}
          title="Import template from JSON file"
        >
          Import JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { void handleImportFile(e); }}
        />
      </div>

      {/* Save dialog (inline, not a modal) */}
      {showSaveDialog && (
        <div className="rounded-lg border border-[color:var(--panel-border)] bg-[var(--studio-bg)] p-3 space-y-2">
          <p className="text-xs font-medium text-[var(--text-soft)]">Template name</p>
          <input
            className="input"
            placeholder="e.g. Dance Portrait Studio"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveTemplate(); if (e.key === 'Escape') setShowSaveDialog(false); }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              type="button"
              onClick={() => { setShowSaveDialog(false); setNewTemplateName(''); }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              type="button"
              onClick={() => { void saveTemplate(); }}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      {supabaseReady === false ? (
        <p className="text-[11px] text-[var(--text-soft)] px-1">
          Cloud templates unavailable — Supabase not configured. Import/export JSON still works.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-[var(--text-soft)]">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-xs text-[var(--text-soft)]">No templates saved yet.</p>
      ) : (
        <div className="asset-list">
          {templates.map((t) => (
            <div key={t.id} className="asset-item flex-col items-start gap-1">
              <div className="flex w-full items-center justify-between">
                <span className="truncate text-xs font-medium text-[var(--text-primary)]">{t.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-[var(--text-soft)]">
                  {new Date(t.updated_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex w-full gap-1">
                <button
                  className="btn-secondary flex-1 text-xs py-0.5"
                  type="button"
                  onClick={() => applyTemplate(t)}
                  title={`Load "${t.name}"`}
                >
                  Load
                </button>
                <button
                  className="btn-secondary flex-1 text-xs py-0.5"
                  type="button"
                  onClick={() => downloadTemplate(t)}
                  title={`Download "${t.name}" as JSON`}
                >
                  JSON ↓
                </button>
                <button
                  className="btn-secondary text-xs py-0.5 px-2 text-red-400 hover:text-red-300"
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
                    void deleteTemplate(t.id, t.name);
                  }}
                  title={`Delete "${t.name}"`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
