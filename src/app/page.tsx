'use client';

import dynamic from 'next/dynamic';
import { AppHeader } from '@/components/layout/AppHeader';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { ShortcutsOverlay } from '@/components/layout/ShortcutsOverlay';
import { KeyboardShortcutsProvider } from '@/components/layout/KeyboardShortcutsProvider';
import { SessionResumeDialog } from '@/components/layout/SessionResumeDialog';
import { ToastBridge } from '@/components/layout/ToastBridge';
import { ControlPanel } from '@/components/panels/ControlPanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { TemplatesPanel } from '@/components/panels/TemplatesPanel';

const Canvas = dynamic(() => import('@/components/workspace/Canvas'), { ssr: false });

export default function Home() {
  return (
    <KeyboardShortcutsProvider>
      <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--text-primary)]">
        <AppHeader />
        <ShortcutsOverlay />
        <SessionResumeDialog />
        <ToastBridge />

        <main className="grid h-[calc(100vh-56px)] min-h-[780px] grid-cols-[320px_minmax(0,1fr)_360px] gap-4 p-4">
          {/* Left panel — subjects, backdrops, name */}
          <LeftSidebar />

          {/* Centre — canvas */}
          <section className="panel flex min-h-0 flex-col gap-3">
            <Canvas />
          </section>

          {/* Right panel — controls, export, templates */}
          <aside className="panel overflow-auto space-y-4">
            <ControlPanel />
            <ExportPanel />
            <TemplatesPanel />
          </aside>
        </main>
      </div>
    </KeyboardShortcutsProvider>
  );
}
