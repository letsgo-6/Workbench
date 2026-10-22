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
    newItem: () => {
      const input = document.querySelector<HTMLTextAreaElement>(
        '.home-stage:not(.home-hidden) textarea',
      );
      if (input) input.focus();
      else window.dispatchEvent(new Event('new-item'));
    },
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

export function editableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input,textarea,select,[contenteditable="true"],.cm-editor',
      ),
    )
  );
}
export function bindSceneKeys(actions: {
  home: boolean;
  enter: (id: import('@/features/home/scene/types').NodeId) => void;
  back: () => void;
}) {
  const ids = ['idea', 'material', 'todo', 'tip', 'skill', 'prompt'] as const;
  const handler = (e: KeyboardEvent) => {
    if (
      e.defaultPrevented ||
      e.isComposing ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey
    )
      return;
    if (
      document.querySelector(
        '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"][data-state="open"]',
      )
    )
      return;
    if (e.key === 'Escape') {
      // Inline capture owns cancel; module editors must blur before CodeMirror consumes Escape.
      if (actions.home && editableTarget(e.target)) return;
      if (useUi.getState().selection.length) {
        e.preventDefault();
        e.stopPropagation();
        useUi.getState().setSelection([]);
        window.dispatchEvent(new Event('clear-selection'));
        return;
      }
      if (editableTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement as HTMLElement)?.blur();
        return;
      }
      if (!actions.home) {
        e.preventDefault();
        actions.back();
      }
      return;
    }
    if (editableTarget(e.target)) return;
    if (/^[0-5]$/.test(e.key)) {
      e.preventDefault();
      actions.enter(ids[Number(e.key)]!);
    }
    if (e.key === '/' && actions.home) {
      e.preventDefault();
      document
        .querySelector<HTMLTextAreaElement>('.home-composer textarea')
        ?.focus();
    }
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}
