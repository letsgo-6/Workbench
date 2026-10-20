import { tinykeys } from 'tinykeys';
import { useUi } from '@/stores/ui';
import { useAiStore } from '@/features/ai/store';
const modifiers: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  super: 'Meta',
};
function normalize(key: string) {
  return key
    .split('+')
    .map((part) => modifiers[part.toLowerCase()] ?? part)
    .join('+');
}
export function validKeymap(map: Record<string, string>) {
  const normalized = Object.values(map).map((v) => normalize(v).toLowerCase());
  return (
    new Set(normalized).size === normalized.length &&
    Object.values(map).every((v) =>
      /^(?:(?:Ctrl|Control|Alt|Shift|Meta|Super)\+)+(?:[a-z0-9]|Space|Enter|Escape|F\d{1,2})$/i.test(
        v,
      ),
    )
  );
}
export function bindKeys(map: Record<string, string>) {
  const actions: Record<string, (event: KeyboardEvent) => void> = {
    palette: () => useUi.getState().setPalette(true),
    newItem: () => window.dispatchEvent(new Event('new-item')),
    aiDrawer: () => {
      const s = useAiStore.getState();
      s.patch({ open: !s.open });
    },
    filter: () =>
      document.querySelector<HTMLInputElement>('#list-filter')?.focus(),
  };
  const bindings: Record<string, (e: KeyboardEvent) => void> = {};
  for (const [name, key] of Object.entries(map)) {
    const action = actions[name];
    if (action)
      bindings[normalize(key)] = (e) => {
        e.preventDefault();
        action(e);
      };
  }
  return tinykeys(window, bindings);
}
