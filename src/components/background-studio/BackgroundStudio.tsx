'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ImageIcon, Search, Sparkles, Upload } from 'lucide-react';
import { BackdropPanel } from '@/components/panels/BackdropPanel';
import { useActiveBackdrop, useBackdrops } from '@/lib/store/selectors';
import { useStore } from '@/lib/store';

const ACTIVITIES = [
  'Dance', 'Gymnastics', 'Cheer', 'Martial Arts', 'Basketball', 'Volleyball',
  'Soccer', 'Football', 'Baseball', 'Softball', 'Golf', 'Hockey', 'Swimming',
  'Wrestling', 'Lacrosse', 'Tennis', 'Track & Field', 'Cross Country', 'School',
  'Daycare', 'Family', 'Senior Portraits', 'Pro Bono',
] as const;

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

function ControlSection({ title, summary, children, open = false }: {
  title: string;
  summary: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group border-b border-[color:var(--panel-border)] py-3" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="block text-[11px] text-[var(--text-soft)]">{summary}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-[var(--brand-soft)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
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
      <div className="mx-auto h-9 w-9 rounded-full border-2 border-dashed border-white/70 bg-white/5" />
      <div className="mt-1 h-36 w-20 rounded-[45%_45%_18%_18%] border-2 border-dashed border-white/70 bg-white/5" />
    </div>
  ));
}

export function BackgroundStudio({ onUseInComposite }: BackgroundStudioProps) {
  const activeBackdrop = useActiveBackdrop();
  const backdrops = useBackdrops();
  const showToast = useStore((state) => state.showToast);
  const libraryRef = useRef<HTMLElement>(null);
  const [organizationName, setOrganizationName] = useState('St. James Mustangs');
  const [newOrganizationConfirmed, setNewOrganizationConfirmed] = useState(false);
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number]>('Volleyball');
  const [style, setStyle] = useState('arena');
  const [poseCount, setPoseCount] = useState<1 | 2 | 3>(1);
  const [includeTeamName, setIncludeTeamName] = useState(true);
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [useCustomDirection, setUseCustomDirection] = useState(false);
  const [customDirection, setCustomDirection] = useState('');

  const savedOrganization = useMemo(
    () => SAVED_ORGANIZATIONS.find((org) => org.name.toLowerCase() === organizationName.trim().toLowerCase()),
    [organizationName],
  );
  const isUnconfirmedNewOrganization = organizationName.trim().length > 0 && !savedOrganization && !newOrganizationConfirmed;

  function openLibrary(message: string) {
    libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(message);
  }

  function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
    setIncludeLogo(true);
  }

  return (
    <main
      className="grid min-h-[calc(100vh-56px)] grid-cols-1 gap-4 overflow-auto p-4 xl:h-[calc(100vh-56px)] xl:min-h-[780px] xl:grid-cols-[340px_minmax(520px,1fr)_380px] xl:overflow-hidden"
      data-testid="background-studio-workspace"
    >
      <aside className="panel overflow-y-auto" aria-label="Background controls">
        <div className="mb-2">
          <p className="panel-title">Background direction</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
            Set the direction, explore options, refine one choice, then finish one production master.
          </p>
        </div>

        <ControlSection title="Team or organization" summary={savedOrganization?.status ?? 'New local draft'} open>
          <label className="block text-xs text-[var(--text-soft)]" htmlFor="organization-name">Team or organization</label>
          <input
            id="organization-name"
            className="input mt-1"
            list="saved-organizations"
            value={organizationName}
            onChange={(event) => { setOrganizationName(event.target.value); setNewOrganizationConfirmed(false); }}
            placeholder="Start typing a team name"
          />
          <datalist id="saved-organizations">
            {SAVED_ORGANIZATIONS.map((org) => <option key={org.id} value={org.name} />)}
          </datalist>
          {savedOrganization ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-200">Profile loaded</span>
                <span className="text-[10px] text-[var(--text-soft)]">starter data</span>
              </div>
              <div className="mt-2 flex gap-2" aria-label="Team colors">
                {savedOrganization.colors.map((color) => (
                  <span key={color} className="h-7 w-7 rounded-full border border-white/30" style={{ background: color }} title={color} />
                ))}
              </div>
            </div>
          ) : isUnconfirmedNewOrganization ? (
            <button type="button" className="btn-secondary mt-2 w-full" onClick={() => setNewOrganizationConfirmed(true)}>
              Confirm new organization
            </button>
          ) : organizationName.trim() ? (
            <p className="mt-2 text-xs text-[var(--brand-soft)]">New organization confirmed for this local session.</p>
          ) : null}
          <label className="mt-3 block text-xs text-[var(--text-soft)]" htmlFor="activity">Activity type</label>
          <select id="activity" className="input mt-1" value={activity} onChange={(event) => setActivity(event.target.value as (typeof ACTIVITIES)[number])}>
            {ACTIVITIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </ControlSection>

        <ControlSection title="Style" summary={STYLES.find((item) => item.id === style)?.label ?? 'Choose a direction'} open>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`overflow-hidden rounded-lg border text-left ${style === item.id ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]' : 'border-[color:var(--panel-border)]'}`}
                onClick={() => setStyle(item.id)}
                aria-pressed={style === item.id}
              >
                <span className={`block h-16 bg-gradient-to-br ${item.swatch}`} />
                <span className="block bg-black/25 px-2 py-1.5 text-[10px] text-white">{item.label}</span>
              </button>
            ))}
          </div>
        </ControlSection>

        <ControlSection title="Composition" summary={`${poseCount} subject ${poseCount === 1 ? 'guide' : 'guides'}`} open>
          <p className="mb-2 text-xs text-[var(--text-soft)]">Plan clear space for the final photographed subjects.</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Subject pose guides">
            {([1, 2, 3] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={poseCount === count ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setPoseCount(count)}
                aria-pressed={poseCount === count}
              >
                {count} {count === 1 ? 'pose' : 'poses'}
              </button>
            ))}
          </div>
        </ControlSection>

        <ControlSection title="Text and logo" summary="Team-level overlays only">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeTeamName} onChange={(event) => setIncludeTeamName(event.target.checked)} /> Include team name</label>
          <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} /> Include team logo</label>
          <label className="btn-secondary mt-3 flex cursor-pointer items-center justify-center gap-2">
            <Upload className="h-3.5 w-3.5" /> Upload exact logo
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => handleLogoUpload(event.target.files?.[0])} />
          </label>
          <p className="mt-2 text-[10px] leading-4 text-[var(--text-soft)]">Player names and numbers are added later in the production workflow.</p>
        </ControlSection>

        <ControlSection title="Custom direction" summary={useCustomDirection ? 'Included in the generation brief' : 'Optional'}>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useCustomDirection} onChange={(event) => setUseCustomDirection(event.target.checked)} /> Add custom text</label>
          {useCustomDirection && <textarea className="input mt-3 min-h-24 resize-y" value={customDirection} onChange={(event) => setCustomDirection(event.target.value)} placeholder="Describe a specific mood, texture, prop, or visual idea…" />}
        </ControlSection>
      </aside>

      <section className="panel flex min-h-[680px] flex-col xl:min-h-0" aria-label="Live composition preview">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="panel-title">Live composition preview</p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">4:5 production frame • subject guides are not exported</p>
          </div>
          <div className="rounded-lg border border-[color:var(--panel-border)] px-2 py-1 text-[10px] text-[var(--brand-soft)]">{activity}</div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          <div className="relative aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-xl border border-[color:var(--panel-border)] bg-[radial-gradient(circle_at_50%_28%,rgba(99,103,255,.22),rgba(10,10,15,.96)_62%)] shadow-2xl xl:h-full xl:max-h-[calc(100vh-230px)] xl:w-auto xl:max-w-full" data-testid="background-preview">
            {activeBackdrop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeBackdrop.objectUrl} alt={activeBackdrop.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center text-[var(--text-soft)]">
                <ImageIcon className="mb-3 h-10 w-10 text-[var(--brand-secondary)]" />
                <p className="text-sm font-semibold text-white">No background selected</p>
                <p className="mt-1 text-xs leading-5">Search the existing library or open generation controls to create a direction.</p>
              </div>
            )}
            {includeTeamName && organizationName.trim() && (
              <div className="absolute left-0 right-0 top-[7%] text-center text-lg font-black uppercase tracking-[0.14em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] sm:text-2xl">
                {organizationName}
              </div>
            )}
            {includeLogo && (
              <div className="absolute right-[6%] top-[16%] flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-emerald-900/85 text-xl font-black text-white shadow-lg">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Uploaded team logo" className="h-full w-full object-contain" />
                ) : 'M'}
              </div>
            )}
            <SubjectGuides count={poseCount} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[color:var(--panel-border)] pt-3">
          <button type="button" className="btn-secondary flex items-center justify-center gap-2" onClick={() => openLibrary('Review the existing library before generating a new direction.')}>
            <Search className="h-4 w-4" /> Search existing
          </button>
          <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={() => openLibrary('Choose AI Generate, confirm the prompt and model, then generate directions.')}>
            <Sparkles className="h-4 w-4" /> Generate directions
          </button>
          <button type="button" className="btn-secondary" onClick={onUseInComposite} disabled={!activeBackdrop}>
            Use in Composite
          </button>
        </div>
      </section>

      <aside ref={libraryRef} className="panel overflow-y-auto" aria-label="Background library and generation">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="panel-title">Library & generation</p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">{backdrops.length} available this session</p>
          </div>
          <span className="rounded-full border border-[color:var(--panel-border)] px-2 py-1 text-[10px] text-[var(--brand-soft)]">Explore 3 by default</span>
        </div>
        <BackdropPanel />
      </aside>
    </main>
  );
}
