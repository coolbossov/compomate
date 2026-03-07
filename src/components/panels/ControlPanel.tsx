'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  useComposition,
  useActiveSubject,
  useActiveBackdrop,
} from '@/lib/store/selectors';
import { analyzeSubjectPose, detectBackdropLightDirection, type PoseAnalysis } from '@/lib/client/utils';
import { clamp, INITIAL_COMPOSITION } from '@/lib/shared/composition';
import { NAME_OVERLAY_DEFAULTS } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Inline mini-components (scoped to this panel)
// ---------------------------------------------------------------------------

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
        <span>{label}</span>
        <span className="font-mono text-[var(--text-primary)]">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        className="w-full accent-[var(--brand-primary)]"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

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

function SectionHeader({
  title,
  onReset,
}: {
  title: string;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-1">
      <h2 className="panel-title">{title}</h2>
      <button
        type="button"
        onClick={onReset}
        className="p-1 rounded hover:bg-[#2A2A38] text-[#6367FF] opacity-60 hover:opacity-100 transition-opacity"
        title={`Reset ${title} to defaults`}
        aria-label={`Reset ${title} to defaults`}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ControlPanel
// ---------------------------------------------------------------------------

export function ControlPanel() {
  const composition = useComposition();
  const activeSubject = useActiveSubject();
  const activeBackdrop = useActiveBackdrop();

  const updateComposition = useStore((s) => s.updateComposition);
  const applyBlendPreset = useStore((s) => s.applyBlendPreset);
  const resetComposition = useStore((s) => s.resetComposition);
  const setNameSizePct = useStore((s) => s.setNameSizePct);
  const setNameYFromBottomPct = useStore((s) => s.setNameYFromBottomPct);

  const [isAutoTuning, setIsAutoTuning] = useState(false);
  const [poseAnalysis, setPoseAnalysis] = useState<PoseAnalysis | null>(null);

  async function handleAutoPlacement(): Promise<void> {
    if (!activeSubject) return;

    let analysis = poseAnalysis;
    if (!analysis) {
      try {
        analysis = await analyzeSubjectPose(activeSubject.objectUrl);
        setPoseAnalysis(analysis);
      } catch {
        analysis = { stanceWidthPct: 34, leanPct: 0, subjectAspect: 0.52 };
      }
    }

    const suggestedHeight = clamp(62 + (0.52 - analysis.subjectAspect) * 26, 48, 82);
    updateComposition({
      xPct: clamp(50 - analysis.leanPct * 0.22, 8, 92),
      yPct: 85,
      subjectHeightPct: suggestedHeight,
      reflectionEnabled: true,
      reflectionSizePct: 94,
      reflectionOpacityPct: 34,
      reflectionBlurPx: 2,
      shadowEnabled: true,
      shadowStrengthPct: clamp(36 + analysis.stanceWidthPct * 0.25, 20, 76),
      shadowStretchPct: clamp(88 + analysis.stanceWidthPct * 0.45, 65, 170),
      shadowBlurPx: 12,
      fogEnabled: false,
    });
  }

  async function handleAutoShadowDirection(): Promise<void> {
    if (!activeBackdrop) return;
    setIsAutoTuning(true);
    try {
      const direction = await detectBackdropLightDirection(
        activeBackdrop.objectUrl,
        composition.xPct,
        composition.yPct,
      );
      updateComposition({
        lightDirectionDeg: direction,
        lightElevationDeg: clamp(
          38 + ((poseAnalysis?.stanceWidthPct ?? 34) - 34) * 0.2,
          20,
          62,
        ),
      });
    } finally {
      setIsAutoTuning(false);
    }
  }

  function handleResetAllControls(): void {
    resetComposition();
    setNameSizePct(NAME_OVERLAY_DEFAULTS.sizePct);
    setNameYFromBottomPct(NAME_OVERLAY_DEFAULTS.yFromBottomPct);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Controls</h2>
        <button
          type="button"
          className="btn-secondary h-8 px-2 text-xs"
          onClick={handleResetAllControls}
          title="Reset all visual controls to their defaults"
        >
          Reset All
        </button>
      </div>

      {/* Auto Assist */}
      <section className="space-y-3">
        <h2 className="panel-title">Auto Assist</h2>
        <button
          className="btn-secondary w-full"
          type="button"
          onClick={() => { void handleAutoPlacement(); }}
        >
          Auto Place + Blend
        </button>
        <button
          className="btn-secondary w-full"
          type="button"
          onClick={() => { void handleAutoShadowDirection(); }}
          disabled={isAutoTuning}
        >
          {isAutoTuning ? 'Analyzing light...' : 'Auto Shadow Direction'}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-secondary" type="button" onClick={() => applyBlendPreset('soft')}>Soft</button>
          <button className="btn-secondary" type="button" onClick={() => applyBlendPreset('studio')}>Studio</button>
          <button className="btn-secondary" type="button" onClick={() => applyBlendPreset('dramatic')}>Dramatic</button>
        </div>
      </section>

      {/* Placement */}
      <section className="space-y-3">
        <SectionHeader
          title="Placement"
          onReset={() => updateComposition({
            xPct: INITIAL_COMPOSITION.xPct,
            yPct: INITIAL_COMPOSITION.yPct,
            subjectHeightPct: INITIAL_COMPOSITION.subjectHeightPct,
          })}
        />
        <SliderControl label="X position" value={composition.xPct} min={5} max={95} step={1} suffix="%" onChange={(v) => updateComposition({ xPct: v })} />
        <SliderControl label="Y baseline" value={composition.yPct} min={25} max={96} step={1} suffix="%" onChange={(v) => updateComposition({ yPct: v })} />
        <SliderControl label="Subject height" value={composition.subjectHeightPct} min={20} max={95} step={1} suffix="%" onChange={(v) => updateComposition({ subjectHeightPct: v })} />
      </section>

      {/* Shadow */}
      <section className="space-y-3">
        <SectionHeader
          title="Shadow"
          onReset={() => updateComposition({
            shadowEnabled: INITIAL_COMPOSITION.shadowEnabled,
            shadowStrengthPct: INITIAL_COMPOSITION.shadowStrengthPct,
            lightDirectionDeg: INITIAL_COMPOSITION.lightDirectionDeg,
            lightElevationDeg: INITIAL_COMPOSITION.lightElevationDeg,
            shadowStretchPct: INITIAL_COMPOSITION.shadowStretchPct,
            shadowBlurPx: INITIAL_COMPOSITION.shadowBlurPx,
          })}
        />
        <ToggleControl label="Enable shadow" checked={composition.shadowEnabled} onChange={(v) => updateComposition({ shadowEnabled: v })} />
        {composition.shadowEnabled ? (
          <>
            <SliderControl label="Shadow strength" value={composition.shadowStrengthPct} min={0} max={100} step={1} suffix="%" onChange={(v) => updateComposition({ shadowStrengthPct: v })} />
            <SliderControl label="Light direction" value={composition.lightDirectionDeg} min={0} max={359} step={1} suffix="deg" onChange={(v) => updateComposition({ lightDirectionDeg: v })} />
            <SliderControl label="Light elevation" value={composition.lightElevationDeg} min={5} max={85} step={1} suffix="deg" onChange={(v) => updateComposition({ lightElevationDeg: v })} />
            <SliderControl label="Shadow stretch" value={composition.shadowStretchPct} min={35} max={250} step={1} suffix="%" onChange={(v) => updateComposition({ shadowStretchPct: v })} />
            <SliderControl label="Shadow blur" value={composition.shadowBlurPx} min={0} max={40} step={1} suffix="px" onChange={(v) => updateComposition({ shadowBlurPx: v })} />
          </>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">Shadow is disabled.</p>
        )}
      </section>

      {/* Reflection */}
      <section className="space-y-3">
        <SectionHeader
          title="Reflection"
          onReset={() => updateComposition({
            reflectionEnabled: INITIAL_COMPOSITION.reflectionEnabled,
            reflectionSizePct: INITIAL_COMPOSITION.reflectionSizePct,
            reflectionPositionPct: INITIAL_COMPOSITION.reflectionPositionPct,
            reflectionOpacityPct: INITIAL_COMPOSITION.reflectionOpacityPct,
            reflectionBlurPx: INITIAL_COMPOSITION.reflectionBlurPx,
          })}
        />
        <ToggleControl label="Enable reflection" checked={composition.reflectionEnabled} onChange={(v) => updateComposition({ reflectionEnabled: v })} />
        {composition.reflectionEnabled ? (
          <>
            <SliderControl label="Length" value={composition.reflectionSizePct} min={0} max={200} step={1} suffix="%" onChange={(v) => updateComposition({ reflectionSizePct: v })} />
            <SliderControl label="Height" value={composition.reflectionPositionPct} min={70} max={130} step={1} suffix="%" onChange={(v) => updateComposition({ reflectionPositionPct: v })} />
            <SliderControl label="Opacity" value={composition.reflectionOpacityPct} min={0} max={90} step={1} suffix="%" onChange={(v) => updateComposition({ reflectionOpacityPct: v })} />
            <SliderControl label="Blur" value={composition.reflectionBlurPx} min={0} max={20} step={1} suffix="px" onChange={(v) => updateComposition({ reflectionBlurPx: v })} />
          </>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">Reflection is hidden.</p>
        )}
      </section>

      {/* Blend Helpers */}
      <section className="space-y-3">
        <SectionHeader
          title="Blend Helpers"
          onReset={() => updateComposition({
            legFadeEnabled: INITIAL_COMPOSITION.legFadeEnabled,
            legFadeStartPct: INITIAL_COMPOSITION.legFadeStartPct,
            fogEnabled: INITIAL_COMPOSITION.fogEnabled,
            fogOpacityPct: INITIAL_COMPOSITION.fogOpacityPct,
            fogHeightPct: INITIAL_COMPOSITION.fogHeightPct,
          })}
        />
        <ToggleControl label="Leg gradient fade" checked={composition.legFadeEnabled} onChange={(v) => updateComposition({ legFadeEnabled: v })} />
        {composition.legFadeEnabled && (
          <SliderControl label="Fade start" value={composition.legFadeStartPct} min={45} max={95} step={1} suffix="%" onChange={(v) => updateComposition({ legFadeStartPct: v })} />
        )}
        <ToggleControl label="Floor fog blend" checked={composition.fogEnabled} onChange={(v) => updateComposition({ fogEnabled: v })} />
        {composition.fogEnabled && (
          <>
            <SliderControl label="Fog opacity" value={composition.fogOpacityPct} min={5} max={95} step={1} suffix="%" onChange={(v) => updateComposition({ fogOpacityPct: v })} />
            <SliderControl label="Fog height" value={composition.fogHeightPct} min={8} max={60} step={1} suffix="%" onChange={(v) => updateComposition({ fogHeightPct: v })} />
          </>
        )}
      </section>

      {/* Name Overlay */}
      <section className="space-y-3">
        <SectionHeader
          title="Name Overlay"
          onReset={() => {
            setNameSizePct(NAME_OVERLAY_DEFAULTS.sizePct);
            setNameYFromBottomPct(NAME_OVERLAY_DEFAULTS.yFromBottomPct);
          }}
        />
        <p className="text-xs text-[var(--text-soft)]">Configure name overlay in the Name panel on the left.</p>
      </section>
    </div>
  );
}
