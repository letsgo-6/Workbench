import { it, expect, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { usePromptSession } from './usePromptSession';
import { AutosaveController } from '@/hooks/autosave-controller';
import { emptyDraft } from '../content/draft';
afterEach(() => {
  cleanup();
  clearMocks();
});
it('flushes the latest draft before a boundary snapshot and does not snapshot autosave edits', async () => {
  const events: string[] = [];
  mockIPC((command) => {
    expect(command).toBe('prompt_version_create');
    events.push('snapshot');
    return null;
  });
  const initial = { ...emptyDraft('prompt'), title: '提示', body: '初始' };
  const controller = new AutosaveController(
    initial,
    async () => {
      events.push('save');
    },
    () => {},
  );
  const hook = renderHook(() => usePromptSession('prompt', 'p', controller));
  controller.update({ ...initial, body: '第一次输入' });
  controller.update({ ...initial, body: '最终正文' });
  expect(events).toEqual([]);
  window.dispatchEvent(new Event('blur'));
  await waitFor(() => expect(events).toEqual(['save', 'snapshot']));
  hook.unmount();
  await waitFor(() => expect(events).toEqual(['save', 'snapshot', 'snapshot']));
});
it('does not version a never-edited blank prompt', async () => {
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    return null;
  });
  const controller = new AutosaveController(
    emptyDraft('prompt'),
    async () => {},
    () => {},
  );
  const hook = renderHook(() => usePromptSession('prompt', 'p', controller));
  window.dispatchEvent(new Event('blur'));
  await controller.flush();
  hook.unmount();
  await Promise.resolve();
  expect(calls).toHaveLength(0);
});
