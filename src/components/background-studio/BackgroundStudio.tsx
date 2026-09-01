'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { BackdropPanel, type BackdropPanelHandle } from '@/components/panels/BackdropPanel';
import { useActiveBackdrop, useBackdrops } from '@/lib/store/selectors';
import { useStore } from '@/lib/store';
import {
  BACKGROUND_ACTIVITIES,
  buildBackgroundDirectionPrompt,
  DEFAULT_BACKGROUND_STUDIO_STATE,
  type BackgroundActivity,
  type BackgroundStudioState,
  type BackgroundStyleId,
  type HeadshotEnvironment,
} from '@/lib/shared/background-studio';
import { fileToDataUrl } from '@/lib/client/utils';

const STYLES = [
  { id: 'arena', label: 'Cinematic Arena', swatch: 'from-emerald-950 via-zinc-950 to-emerald-700' },
  { id: 'graphic', label: 'Bold Graphic', swatch: 'from-emerald-700 via-white to-zinc-950' },
  { id: 'smoke', label: 'Studio Smoke', swatch: 'from-zinc-950 via-emerald-900 to-slate-500' },
  { id: 'light', label: 'Clean Light', swatch: 'from-white via-emerald-100 to-slate-400' },
  { id: 'texture', label: 'Textured Wall', swatch: 'from-zinc-700 via-emerald-950 to-zinc-900' },
  { id: 'motion', label: 'Energy Motion', swatch: 'from-black via-emerald-600 to-white' },
  { id: 'school', label: 'School Spirit', swatch: 'from-emerald-800 via-yellow-100 to-white' },
  { id: 'minimal', label: 'Modern Minimal', swatch: 'from-zinc-950 via-zinc-800 to-emerald-900' },
] as const;

const SAVED_ORGANIZATIONS = [{
  id: 'st-james-mustangs',
  name: 'St. James Mustangs',
  status: 'Starter profile',
  colors: ['#0d5c3d', '#ffffff', '#24262b'],
}];

interface BackgroundStudioProps {
  onUseInComposite: () => void;
}

function ControlSection({ title, summary, children }: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-[color:var(--panel-border)]" data-testid="inspector-section">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-[#fff7fe]">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
          <span className="block truncate text-[10px] text-[var(--text-soft)]">{summary}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--brand-soft)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[color:var(--panel-border)] bg-[#fcfcfd] p-3">{children}</div>
    </details>
  );
}

function SubjectGuides({ count }: { count: 1 | 2 | 3 }) {
  const positions = count === 1 ? ['50%'] : count === 2 ? ['35%', '65%'] : ['25%', '50%', '75%'];
  return positions.map((left, index) => (
    <div
      key={`${count}-${left}`}
      className="absolute bottom-[9%] -translate-x-1/2"
      style={{ left, zIndex: count - index }}
      data-testid="subject-guide"
    >
      <div className="mx-auto h-9 w-9 rounded-full border-2 border-dashed border-white/80 bg-black/5 shadow-sm" />
      <div className="mt-1 h-36 w-20 rounded-[45%_45%_18%_18%] border-2 border-dashed border-white/80 bg-black/5 shadow-sm" />
    </div>
  ));
}

export function BackgroundStudio({ onUseInComposite }: BackgroundStudioProps) {
  const activeBackdrop = useActiveBackdrop();
  const backdrops = useBackdrops();
  const showToast = useStore((state) => state.showToast);
  const libraryRef = useRef<HTMLElement>(null);
  const backdropPanelRef = useRef<BackdropPanelHandle>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const studio = useStore((state) => state.backgroundStudio ?? DEFAULT_BACKGROUND_STUDIO_STATE);
  const updateBackgroundStudio = useStore((state) => state.updateBackgroundStudio);
  const [isGeneratingDirections, setIsGeneratingDirections] = useState(false);
  const [isFinishingMaster, setIsFinishingMaster] = useState(false);
  const { organizationName, activity, style, poseCount, includeTeamName, includeLogo, logoDataUrl, useCustomDirection, customDirection } = studio;

  function updateStudio(patch: Partial<BackgroundStudioState>) {
    updateBackgroundStudio(patch);
  }

  const savedOrganization = useMemo(
    () => SAVED_ORGANIZATIONS.find((org) => org.name.toLowerCase() === organizationName.trim().toLowerCase()),
    [organizationName],
  );
  const isUnconfirmedNewOrganization = organizationName.trim().length > 0 && !savedOrganization && !studio.organizationConfirmed;

  function openLibrary(message: string) {
    setLibraryOpen(true);
    requestAnimationFrame(() => libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    showToast(message);
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateStudio({ logoDataUrl: dataUrl, includeLogo: true });
  }

  async function generateDirections() {
    if (isUnconfirmedNewOrganization) {
      showToast('Confirm the new organization before generating directions.');
      return;
    }
    setLibraryOpen(true);
    setIsGeneratingDirections(true);
    try {
      await backdropPanelRef.current?.generateDirections(buildBackgroundDirectionPrompt(studio));
    } finally {
      setIsGeneratingDirections(false);
    }
  }

  async function finishProductionMaster() {
    setIsFinishingMaster(true);
    try {
      await backdropPanelRef.current?.finishProductionMaster();
    } finally {
      setIsFinishingMaster(false);
    }
  }

  const desktopColumns = libraryOpen
    ? 'xl:grid-cols-[300px_minmax(520px,1fr)_320px]'
    : 'xl:grid-cols-[72px_minmax(520px,1fr)_320px]';

  return (
    <main
      className={`grid min-h-[calc(100vh-52px)] grid-cols-1 gap-2 overflow-auto p-2 xl:h-[calc(100vh-52px)] xl:min-h-[720px] ${desktopColumns} xl:overflow-hidden`}
      data-testid="background-studio-workspace"
      data-layout="minimal-canvas"
    >
      <aside ref={libraryRef} className="panel order-2 overflow-y-auto !p-0 xl:order-none" aria-label="Background library and generation">
        <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between border-b border-[color:var(--panel-border)] bg-white px-3">
          {libraryOpen && (
            <div className="min-w-0">
              <p className="text-xs font-semibold">Library</p>
              <p className="truncate text-[10px] text-[var(--text-soft)]">{backdrops.length} this session</p>
            </div>
          )}
          <button
            type="button"
            className="btn-secondary ml-auto flex h-7 w-7 items-center justify-center p-0"
            onClick={() => setLibraryOpen((open) => !open)}
            aria-label={libraryOpen ? 'Collapse library' : 'Expand library'}
            aria-expanded={libraryOpen}
          >
            {libraryOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className={libraryOpen ? 'block' : 'xl:hidden'}>
          <BackdropPanel
            ref={backdropPanelRef}
          />
        </div>
        {!libraryOpen && (
          <div className="hidden space-y-2 p-2 xl:block" aria-label="Collapsed background thumbnails">
            {backdrops.slice(0, 7).map((backdrop) => (
              <button
                key={backdrop.id}
                type="button"
                className={`block aspect-[4/5] w-full overflow-hidden rounded-md border-2 ${activeBackdrop?.id === backdrop.id ? 'border-[var(--brand-secondary)]' : 'border-[color:var(--panel-border)]'}`}
                onClick={() => useStore.getState().setActiveBackdrop(backdrop.id)}
                title={backdrop.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={backdrop.objectUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {backdrops.length === 0 && <ImageIcon className="mx-auto mt-4 h-5 w-5 text-[var(--text-soft)]" />}
          </div>
        )}
      </aside>

      <section className="order-1 flex min-h-[680px] flex-col xl:order-none xl:min-h-0" aria-label="Live composition preview">
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-2 pt-1">
          <div className="relative aspect-[4/5] w-full max-w-[620px] overflow-hidden rounded-md border border-[color:var(--panel-border)] bg-[linear-gradient(145deg,#ffffff_0%,#fbf0fa_44%,#e9e9ed_100%)] shadow-[0_12px_32px_rgba(31,31,38,.08)] xl:h-full xl:max-h-[calc(100vh-150px)] xl:w-auto xl:max-w-full" data-testid="background-preview">
            {activeBackdrop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeBackdrop.objectUrl} alt={activeBackdrop.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -left-1/4 bottom-[12%] h-[32%] w-[145%] -rotate-6 bg-[linear-gradient(90deg,transparent,#ffdbfd_35%,#f5bcee_62%,transparent)] opacity-75" />
                <div className="absolute -right-[8%] top-[14%] h-52 w-52 rounded-full border-[28px] border-white/70" />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center text-[var(--text-soft)]">
                  <ImageIcon className="mb-3 h-8 w-8 text-[var(--brand-soft)]" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">No background selected</p>
                  <p className="mt-1 max-w-64 text-xs leading-5">Search the library or generate directions when the composition is ready.</p>
                </div>
              </div>
            )}
            <div className="absolute right-3 top-3 rounded-md border border-white/70 bg-white/85 px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] shadow-sm backdrop-blur">{activity}</div>
            {includeTeamName && organizationName.trim() && (
              <div className="absolute left-0 right-0 top-[7%] text-center text-lg font-black uppercase tracking-[0.14em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] sm:text-2xl">
                {organizationName}
              </div>
            )}
            {includeLogo && (
              <div className="absolute right-[6%] top-[16%] flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-emerald-900/85 text-xl font-black text-white shadow-lg">
                {logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoDataUrl} alt="Uploaded team logo" className="h-full w-full object-contain" />
                ) : 'M'}
              </div>
            )}
            <SubjectGuides count={poseCount} />
          </div>
        </div>

        <div className="mx-auto mb-2 grid w-full max-w-[620px] grid-cols-2 gap-1 rounded-md border border-[color:var(--panel-border)] bg-white p-1 text-[10px] text-[var(--text-soft)] sm:grid-cols-4" aria-label="Background production workflow">
          <span className="rounded bg-[#fff7fe] px-2 py-1.5"><strong className="text-[var(--text-primary)]">1 Direction</strong><br />Set the brief</span>
          <span className="rounded px-2 py-1.5"><strong className="text-[var(--text-primary)]">2 Explore</strong><br />Compare 3 options</span>
          <span className="rounded px-2 py-1.5"><strong className="text-[var(--text-primary)]">3 Refine</strong><br />Select and adjust</span>
          <span className="rounded px-2 py-1.5"><strong className="text-[var(--text-primary)]">4 Master</strong><br />Finish one file</span>
        </div>
        <div className="mx-auto grid w-full max-w-[620px] grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="preview-actions">
          <button type="button" className="btn-secondary flex items-center justify-center gap-2" onClick={() => openLibrary('Review the existing library before generating a new direction.')}>
            <Search className="h-4 w-4" /> Search existing
          </button>
          <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={() => { void generateDirections(); }} disabled={isGeneratingDirections || isFinishingMaster}>
            <Sparkles className="h-4 w-4" /> {isGeneratingDirections ? 'Generating 3…' : 'Generate 3 directions'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => { void finishProductionMaster(); }} disabled={!activeBackdrop || isGeneratingDirections || isFinishingMaster || activeBackdrop.stage === 'master'}>
            {isFinishingMaster ? 'Finishing master…' : activeBackdrop?.stage === 'master' ? 'Master selected' : 'Finish production master'}
          </button>
          <button type="button" className="btn-secondary" onClick={onUseInComposite} disabled={!activeBackdrop}>
            Use in Composite
          </button>
        </div>
      </section>

      <aside className="panel order-3 overflow-y-auto !p-0 xl:order-none" aria-label="Background controls">
        <div className="border-b border-[color:var(--panel-border)] px-3 py-3">
          <p className="text-xs font-semibold">Background direction</p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-soft)]">Set direction, explore, refine, then finish one master.</p>
        </div>

        <ControlSection title="Team or organization" summary={savedOrganization?.status ?? 'New local draft'}>
          <label className="block text-xs text-[var(--text-soft)]" htmlFor="organization-name">Team or organization</label>
          <input
            id="organization-name"
            className="input mt-1"
            list="saved-organizations"
            value={organizationName}
            onChange={(event) => {
              const name = event.target.value;
              const match = SAVED_ORGANIZATIONS.find((org) => org.name.toLowerCase() === name.trim().toLowerCase());
              updateStudio({
                organizationName: name,
                organizationConfirmed: Boolean(match),
                teamColors: match?.colors ?? studio.teamColors,
              });
            }}
            placeholder="Start typing a team name"
          />
          <datalist id="saved-organizations">
            {SAVED_ORGANIZATIONS.map((org) => <option key={org.id} value={org.name} />)}
          </datalist>
          {savedOrganization ? (
            <div className="mt-3 rounded-md border border-[color:var(--panel-border)] bg-white p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Profile loaded</span>
                <span className="text-[10px] text-[var(--text-soft)]">starter data</span>
              </div>
              <div className="mt-2 flex gap-2" aria-label="Team colors">
                {savedOrganization.colors.map((color) => (
                  <span key={color} className="h-7 w-7 rounded-full border border-black/15" style={{ background: color }} title={color} />
                ))}
              </div>
            </div>
          ) : isUnconfirmedNewOrganization ? (
            <button type="button" className="btn-secondary mt-2 w-full" onClick={() => updateStudio({ organizationConfirmed: true })}>Confirm new organization</button>
          ) : organizationName.trim() ? (
            <p className="mt-2 text-xs text-[var(--brand-soft)]">New organization confirmed for this local session.</p>
          ) : null}
          <label className="mt-3 block text-xs text-[var(--text-soft)]" htmlFor="activity">Activity type</label>
          <select id="activity" className="input mt-1" value={activity} onChange={(event) => updateStudio({ activity: event.target.value as BackgroundActivity })}>
            {BACKGROUND_ACTIVITIES.map((item) => <option key={item}>{item}</option>)}
          </select>
          {activity === 'Headshots' && (
            <>
              <label className="mt-3 block text-xs text-[var(--text-soft)]" htmlFor="headshot-environment">Headshot environment</label>
              <select id="headshot-environment" className="input mt-1" value={studio.headshotEnvironment} onChange={(event) => updateStudio({ headshotEnvironment: event.target.value as HeadshotEnvironment })}>
                <option value="office">Office</option>
                <option value="outside">Outside</option>
                <option value="conference-room">Conference room</option>
              </select>
            </>
          )}
        </ControlSection>

        <ControlSection title="Style" summary={STYLES.find((item) => item.id === style)?.label ?? 'Choose a direction'}>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`overflow-hidden rounded-md border text-left ${style === item.id ? 'border-[var(--brand-secondary)] ring-2 ring-[var(--brand-primary)]' : 'border-[color:var(--panel-border)]'}`}
                onClick={() => updateStudio({ style: item.id as BackgroundStyleId })}
                aria-pressed={style === item.id}
              >
                <span className={`block h-16 bg-gradient-to-br ${item.swatch}`} />
                <span className="block bg-black/65 px-2 py-1.5 text-[10px] text-white">{item.label}</span>
              </button>
            ))}
          </div>
        </ControlSection>

        <ControlSection title="Composition" summary={`${poseCount} subject ${poseCount === 1 ? 'guide' : 'guides'}`}>
          <p className="mb-2 text-xs text-[var(--text-soft)]">Plan clear space for the final photographed subjects.</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Subject pose guides">
            {([1, 2, 3] as const).map((count) => (
              <button key={count} type="button" className={poseCount === count ? 'btn-primary' : 'btn-secondary'} onClick={() => updateStudio({ poseCount: count })} aria-pressed={poseCount === count}>
                {count} {count === 1 ? 'pose' : 'poses'}
              </button>
            ))}
          </div>
        </ControlSection>

        <ControlSection title="Text and logo" summary="Team-level overlays only">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeTeamName} onChange={(event) => updateStudio({ includeTeamName: event.target.checked })} /> Include team name</label>
          <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={includeLogo} onChange={(event) => updateStudio({ includeLogo: event.target.checked })} /> Include team logo</label>
          <label className="btn-secondary mt-3 flex cursor-pointer items-center justify-center gap-2">
            <Upload className="h-3.5 w-3.5" /> Upload exact logo
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => { void handleLogoUpload(event.target.files?.[0]); }} />
          </label>
          <p className="mt-2 text-[10px] leading-4 text-[var(--text-soft)]">These stay editable in the preview. Player names and numbers are added later; none are baked into generated plates.</p>
        </ControlSection>

        <ControlSection title="Custom direction" summary={useCustomDirection ? 'Included in the generation brief' : 'Optional'}>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useCustomDirection} onChange={(event) => updateStudio({ useCustomDirection: event.target.checked })} /> Add custom direction</label>
          {useCustomDirection && <textarea className="input mt-3 min-h-24 resize-y" value={customDirection} onChange={(event) => updateStudio({ customDirection: event.target.value })} placeholder="Describe a specific mood, texture, prop, or visual idea…" />}
          <label className="mt-3 block text-xs text-[var(--text-soft)]" htmlFor="direction-refinement">Refine the selected direction</label>
          <textarea id="direction-refinement" className="input mt-1 min-h-20 resize-y" value={studio.refinement} onChange={(event) => updateStudio({ refinement: event.target.value })} placeholder="Example: calmer center, softer haze, more negative space…" />
          <button type="button" className="btn-secondary mt-2 w-full" onClick={() => { void generateDirections(); }} disabled={isGeneratingDirections}>Generate 3 refined options</button>
        </ControlSection>
      </aside>
    </main>
  );
}
