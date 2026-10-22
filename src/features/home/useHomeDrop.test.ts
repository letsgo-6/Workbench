import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AppError } from '@/lib/ipc';
import { t } from '@/i18n';
import type { HomeEvents } from './scene/events';
import { useHomeDrop } from './useHomeDrop';
const mocks = vi.hoisted(() => ({
  listener: undefined as
    undefined | ((e: { payload: { type: string; paths: string[] } }) => void),
  importFiles: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (listener: typeof mocks.listener) => {
      mocks.listener = listener;
      return () => {};
    },
  }),
}));
vi.mock('@/lib/api/materials', () => ({
  materialsApi: { importFiles: mocks.importFiles },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('../materials/useMaterialImport', () => ({ thumbnails: vi.fn() }));
it('invalid file drop explains supported formats and releases the pending node', async () => {
  mocks.importFiles.mockRejectedValueOnce(new AppError({ code: 'VALIDATION' }));
  const release = vi.fn(),
    handle = vi.fn();
  const events = { release, handle } as unknown as HomeEvents;
  const { unmount } = renderHook(() => useHomeDrop(true, events, vi.fn()));
  await waitFor(() => expect(mocks.listener).toBeDefined());
  act(() =>
    mocks.listener?.({ payload: { type: 'drop', paths: ['fake.png'] } }),
  );
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(t('material.invalidFile')),
  );
  expect(release).toHaveBeenCalledWith(['material']);
  expect(handle).not.toHaveBeenCalled();
  unmount();
});
