'use client';
import { useKeyboardShortcuts } from '@/lib/client/useKeyboardShortcuts';

export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useKeyboardShortcuts();
  return <>{children}</>;
}
