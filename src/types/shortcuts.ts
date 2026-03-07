export interface ShortcutDef {
  key: string;
  description: string;
  modifiers?: ('cmd' | 'shift' | 'alt')[];
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: '[', description: 'Previous file' },
  { key: ']', description: 'Next file' },
  { key: 'z', description: 'Undo', modifiers: ['cmd'] },
  { key: 'z', description: 'Redo', modifiers: ['cmd', 'shift'] },
  { key: 'e', description: 'Export current', modifiers: ['cmd'] },
  { key: 's', description: 'Save template', modifiers: ['cmd'] },
  { key: '?', description: 'Show shortcuts' },
  { key: 'ArrowUp', description: 'Nudge up 1px' },
  { key: 'ArrowDown', description: 'Nudge down 1px' },
  { key: 'ArrowLeft', description: 'Nudge left 1px' },
  { key: 'ArrowRight', description: 'Nudge right 1px' },
  { key: 'ArrowUp', description: 'Nudge up 10px', modifiers: ['shift'] },
  { key: 'ArrowDown', description: 'Nudge down 10px', modifiers: ['shift'] },
  { key: 'ArrowLeft', description: 'Nudge left 10px', modifiers: ['shift'] },
  { key: 'ArrowRight', description: 'Nudge right 10px', modifiers: ['shift'] },
];
