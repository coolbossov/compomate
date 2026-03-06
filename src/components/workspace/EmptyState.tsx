'use client';

type EmptyStateProps = {
  type: 'no-backdrop' | 'no-subject' | 'ready';
};

const MESSAGES: Record<string, string> = {
  'no-backdrop': 'Add a backdrop image to start.',
  'no-subject': 'Add subject photos using the Files panel.',
  ready: '',
};

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'ready') return null;

  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--text-soft)]">
      {MESSAGES[type]}
    </div>
  );
}
