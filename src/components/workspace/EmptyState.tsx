'use client';

import { ImagePlus, Users } from 'lucide-react';

type EmptyStateType = 'no-backdrop' | 'no-subject' | 'ready';

type EmptyStateProps = {
  type: EmptyStateType;
};

const configs = {
  'no-backdrop': {
    Icon: ImagePlus,
    title: 'No backdrop selected',
    subtitle: 'Upload an image or generate one with AI from the left panel',
  },
  'no-subject': {
    Icon: Users,
    title: 'No subject added',
    subtitle: 'Add transparent PNG or TIFF subject files using the Files tab',
  },
} as const;

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'ready') return null;

  const config = configs[type];
  const { Icon, title, subtitle } = config;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="animate-pulse rounded-2xl border border-[rgba(99,103,255,0.2)] bg-[rgba(99,103,255,0.06)] p-5">
        <Icon
          size={36}
          className="text-[var(--brand-primary)] opacity-70"
          strokeWidth={1.5}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs leading-relaxed text-[var(--text-soft)]">{subtitle}</p>
      </div>
    </div>
  );
}
