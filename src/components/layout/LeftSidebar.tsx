'use client';

import { useStore } from '@/lib/store';
import { useLeftTab } from '@/lib/store/selectors';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilePanel } from '@/components/panels/FilePanel';
import { BackdropPanel } from '@/components/panels/BackdropPanel';
import { NameEntryPanel } from '@/components/panels/NameEntryPanel';

export function LeftSidebar() {
  const leftTab = useLeftTab();
  const setLeftTab = useStore((s) => s.setLeftTab);

  return (
    <aside className="panel overflow-auto space-y-4">
      <Tabs
        value={leftTab}
        onValueChange={(value) => setLeftTab(value as 'files' | 'backdrops')}
        className="gap-3"
      >
        <TabsList className="grid w-full grid-cols-2 bg-white/4">
          <TabsTrigger value="files" className="text-xs">
            Subjects
          </TabsTrigger>
          <TabsTrigger value="backdrops" className="text-xs">
            Backdrops
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files">
          <FilePanel />
        </TabsContent>
        <TabsContent value="backdrops">
          <BackdropPanel />
        </TabsContent>
      </Tabs>
      <NameEntryPanel />
    </aside>
  );
}
