import { it, expect, afterEach } from 'vitest';
import { bindKeys, validKeymap } from './keymap';
import { useUi } from '@/stores/ui';
import { useAiStore } from '@/features/ai/store';
afterEach(() => {
  useUi.getState().setPalette(false);
  useAiStore.getState().patch({ open: false });
});
it('stored Ctrl accelerators trigger the real keyboard listener and rebind cleanly', () => {
  const unbind = bindKeys({ palette: 'Ctrl+K', aiDrawer: 'Ctrl+J' });
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      cancelable: true,
    }),
  );
  expect(useUi.getState().palette).toBe(true);
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'j',
      code: 'KeyJ',
      ctrlKey: true,
      cancelable: true,
    }),
  );
  expect(useAiStore.getState().open).toBe(true);
  unbind();
  useUi.getState().setPalette(false);
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      cancelable: true,
    }),
  );
  expect(useUi.getState().palette).toBe(false);
  expect(validKeymap({ palette: 'Ctrl+K', newItem: 'Ctrl+K' })).toBe(false);
});
