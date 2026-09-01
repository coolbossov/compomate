'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { AppHeader, type Workspace } from '@/components/layout/AppHeader';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { ShortcutsOverlay } from '@/components/layout/ShortcutsOverlay';
import { KeyboardShortcutsProvider } from '@/components/layout/KeyboardShortcutsProvider';
import { SessionResumeDialog } from '@/components/layout/SessionResumeDialog';
import { ToastBridge } from '@/components/layout/ToastBridge';
import { ControlPanel } from '@/components/panels/ControlPanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { TemplatesPanel } from '@/components/panels/TemplatesPanel';
import { BackgroundStudio } from '@/components/background-studio/BackgroundStudio';

const Canvas = dynamic(() => import('@/components/workspace/Canvas'), { ssr: false });

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>('composite');

  return (
    <KeyboardShortcutsProvider>
      <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--text-primary)]" data-theme="minimal-canvas" data-testid="minimal-canvas-shell">
        <AppHeader workspace={workspace} onWorkspaceChange={setWorkspace} />
        <ShortcutsOverlay />
        <SessionResumeDialog />
        <ToastBridge />

        {workspace === 'composite' ? (
          <main
            className="grid h-[calc(100vh-52px)] min-h-[720px] grid-cols-[280px_minmax(0,1fr)_320px] gap-2 p-2"
            data-testid="composite-workspace"
          >
            <LeftSidebar />
            <section className="panel flex min-h-0 flex-col gap-3">
              <Canvas />
            </section>
            <aside className="panel overflow-auto space-y-4">
              <ControlPanel />
              <ExportPanel />
              <TemplatesPanel />
            </aside>
          </main>
        ) : (
          <BackgroundStudio onUseInComposite={() => setWorkspace('composite')} />
        )}
      </div>
    </KeyboardShortcutsProvider>
  );
}
