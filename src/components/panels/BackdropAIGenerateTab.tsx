'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BACKDROP_DEFAULT_STYLE_HINT } from '@/lib/constants';
import type { BackdropGenerationState } from '@/types/backdrop';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDEOGRAM_STYLES = [
  { value: 'REALISTIC', label: 'Realistic' },
  { value: 'DESIGN', label: 'Design' },
  { value: 'RENDER_3D', label: 'Render 3D' },
  { value: 'ANIME', label: 'Anime' },
] as const;

type IdeogramStyleValue = (typeof IDEOGRAM_STYLES)[number]['value'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BackdropAIGenerateTabProps {
  onGenerate: (body: Record<string, unknown>, filenamePrefix: string, setGenerating: (v: boolean) => void) => Promise<void>;
  generation: BackdropGenerationState;
  isAnyGenerating: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackdropAIGenerateTab({
  onGenerate,
  generation,
  isAnyGenerating,
}: BackdropAIGenerateTabProps) {
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateStyleHint, setGenerateStyleHint] = useState(BACKDROP_DEFAULT_STYLE_HINT);
  const [generateAspectMode, setGenerateAspectMode] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [ideogramStyle, setIdeogramStyle] = useState<IdeogramStyleValue>('REALISTIC');
  const [isGeneratingFlux, setIsGeneratingFlux] = useState(false);
  const [isGeneratingIdeogram, setIsGeneratingIdeogram] = useState(false);

  return (
    <div className="space-y-4">
      {/* Shared prompt */}
      <textarea
        className="input min-h-20 resize-y"
        placeholder="Describe the backdrop to generate…"
        value={generatePrompt}
        onChange={(e) => setGeneratePrompt(e.target.value)}
      />

      {/* Generation status */}
      {(generation.status === 'generating' || generation.status === 'polling') && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>
            {generation.status === 'generating'
              ? 'Sending to AI...'
              : `Generating backdrop${generation.queuePosition ? ` (queue: ${generation.queuePosition})` : '...'}`}
          </span>
        </div>
      )}
      {generation.status === 'polling' && generation.queuePosition !== undefined && (
        <p className="text-xs text-[var(--text-soft)]">Queue position: {generation.queuePosition}</p>
      )}
      {generation.status === 'error' && (
        <p className="text-xs text-red-400">{generation.error}</p>
      )}

      {/* ── Flux sub-section ── */}
      <div className="space-y-2 rounded-lg border border-[color:var(--panel-border)] p-3">
        <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wider">Flux</p>
        <input
          className="input"
          placeholder="Style hint"
          value={generateStyleHint}
          onChange={(e) => setGenerateStyleHint(e.target.value)}
        />
        <select
          className="input"
          value={generateAspectMode}
          onChange={(e) => setGenerateAspectMode(e.target.value as 'portrait' | 'landscape' | 'square')}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="square">Square</option>
        </select>
        <button
          className="btn-secondary w-full"
          type="button"
          disabled={isAnyGenerating}
          onClick={() =>
            void onGenerate(
              { prompt: generatePrompt, styleHint: generateStyleHint, aspectMode: generateAspectMode, model: 'flux' },
              'flux',
              setIsGeneratingFlux,
            )
          }
        >
          {isGeneratingFlux ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating with Flux…
            </span>
          ) : 'Generate with Flux'}
        </button>
      </div>

      {/* ── Ideogram v2 sub-section ── */}
      <div className="space-y-2 rounded-lg border border-[color:var(--panel-border)] p-3">
        <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wider">Ideogram v2</p>
        <select
          className="input"
          value={ideogramStyle}
          onChange={(e) => setIdeogramStyle(e.target.value as IdeogramStyleValue)}
        >
          {IDEOGRAM_STYLES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          className="btn-secondary w-full"
          type="button"
          disabled={isAnyGenerating}
          onClick={() =>
            void onGenerate(
              { prompt: generatePrompt, model: 'ideogram', styleType: ideogramStyle },
              'ideogram',
              setIsGeneratingIdeogram,
            )
          }
        >
          {isGeneratingIdeogram ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating with Ideogram…
            </span>
          ) : 'Generate with Ideogram'}
        </button>
      </div>
    </div>
  );
}
