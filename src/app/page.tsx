'use client';

import dynamic from 'next/dynamic';
import { AppHeader } from '@/components/layout/AppHeader';
import { ShortcutsOverlay } from '@/components/layout/ShortcutsOverlay';
import { KeyboardShortcutsProvider } from '@/components/layout/KeyboardShortcutsProvider';
import { FilePanel } from '@/components/panels/FilePanel';
import { BackdropPanel } from '@/components/panels/BackdropPanel';
import { NameEntryPanel } from '@/components/panels/NameEntryPanel';
import { ControlPanel } from '@/components/panels/ControlPanel';
import { ExportPanel } from '@/components/panels/ExportPanel';

const Canvas = dynamic(() => import('@/components/workspace/Canvas'), { ssr: false });

export default function Home() {
  return (
    <KeyboardShortcutsProvider>
      <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--text-primary)]">
        <AppHeader />
        <ShortcutsOverlay />

        <main className="grid h-[calc(100vh-56px)] min-h-[780px] grid-cols-[320px_minmax(0,1fr)_360px] gap-4 p-4">
          {/* Left panel — files, backdrops, name */}
          <aside className="panel overflow-auto space-y-4">
            <FilePanel />
            <BackdropPanel />
            <NameEntryPanel />
          </aside>

          {/* Centre — canvas */}
          <section className="panel flex min-h-0 flex-col gap-3">
            <Canvas />
          </section>

          {/* Right panel — controls, export */}
          <aside className="panel overflow-auto space-y-4">
            <ControlPanel />
            <ExportPanel />
          </aside>
        </main>
      </div>
    </KeyboardShortcutsProvider>
  );
}
