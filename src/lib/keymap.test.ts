import { it, expect, afterEach } from 'vitest';
import { bindKeys, bindSceneKeys, validKeymap } from './keymap';
import { vi } from 'vitest';
import { useUi } from '@/stores/ui';
import { useAiStore } from '@/features/ai/store';
afterEach(() => {
  useUi.getState().setPalette(false);
  useAiStore.getState().patch({ open: false });
});
it('digits ignore editors and dialogs; Escape clears selection, then blurs, then returns home', () => {
  const enter = vi.fn(),
    back = vi.fn(),
    unbind = bindSceneKeys({ home: false, enter, back });
  const input = document.createElement('textarea');
  document.body.append(input);
  input.focus();
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }),
  );
  expect(enter).not.toHaveBeenCalled();
  useUi.getState().setSelection(['a']);
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(useUi.getState().selection).toEqual([]);
  expect(document.activeElement).toBe(input);
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).not.toBe(input);
  expect(back).not.toHaveBeenCalled();
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }),
  );
  expect(back).toHaveBeenCalledTimes(1);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.append(dialog);
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: '1', cancelable: true }),
  );
  expect(enter).not.toHaveBeenCalled();
  dialog.remove();
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: '1', cancelable: true }),
  );
  expect(enter).toHaveBeenCalledWith('material');
  input.remove();
  unbind();
});
it('module Escape runs before an editor consumer while inline home capture keeps cancellation', () => {
  const input = document.createElement('textarea');
  document.body.append(input);
  input.focus();
  const consumer = vi.fn((e: KeyboardEvent) => {
    e.preventDefault();
  });
  input.addEventListener('keydown', consumer);
  const module = bindSceneKeys({ home: false, enter: vi.fn(), back: vi.fn() });
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).not.toBe(input);
  expect(consumer).not.toHaveBeenCalled();
  module();
  input.focus();
  const home = bindSceneKeys({ home: true, enter: vi.fn(), back: vi.fn() });
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(consumer).toHaveBeenCalledTimes(1);
  home();
  input.remove();
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
