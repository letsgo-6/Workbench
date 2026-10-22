import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSceneVisibility } from './useSceneVisibility';
const native = vi.hoisted(() => ({
  shown: true,
  reads: 0,
  minimized: false,
  listeners: {} as Record<string, () => void>,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isVisible: async () => {
      native.reads++;
      return native.shown;
    },
    isMinimized: async () => native.minimized,
    onFocusChanged: async (fn: () => void) => {
      native.listeners.focus = fn;
      return () => {};
    },
    onResized: async (fn: () => void) => {
      native.listeners.resize = fn;
      return () => {};
    },
    listen: async (event: string, fn: () => void) => {
      native.listeners[event] = fn;
      return () => {};
    },
  }),
}));
it('pauses for native tray hiding even when WebView document visibility never changes', async () => {
  const { result, unmount } = renderHook(() => useSceneVisibility());
  await waitFor(() => expect(result.current).toBe(true));
  native.shown = false;
  act(() => native.listeners['main-window-visibility']?.());
  await waitFor(() => expect(result.current).toBe(false));
  native.shown = true;
  act(() => native.listeners['main-window-visibility']?.());
  await waitFor(() => expect(result.current).toBe(true));
  native.minimized = true;
  act(() => native.listeners.resize?.());
  await waitFor(() => expect(result.current).toBe(false));
  unmount();
});

it('document visibility changes do not issue native IPC during a page reload', async () => {
  native.shown = true;
  native.minimized = false;
  const { unmount } = renderHook(() => useSceneVisibility());
  await waitFor(() =>
    expect(native.listeners['main-window-visibility']).toBeDefined(),
  );
  await Promise.resolve();
  const reads = native.reads;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await Promise.resolve();
  expect(native.reads).toBe(reads);
  unmount();
});
