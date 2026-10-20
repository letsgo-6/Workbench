import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import type { Idea } from '@/types/bindings/Idea';
import type { Entry } from '@/lib/api/content';
import { ContentDetail } from './ContentDetail';
vi.mock('./EntryDetail', () => ({
  EntryDetail: ({ item }: { item: Entry }) => (
    <div>{item.tags.map((tag) => tag.name).join(',')}</div>
  ),
}));
it('waits for current server tags before initializing an editor from stale cache', async () => {
  const old: Idea = {
    id: 'i1',
    contentMd: 'body',
    date: '2026-10-19',
    isStarred: false,
    origin: null,
    converted: [],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    tags: [{ id: 't1', name: '旧标签', color: null, useCount: 1 }],
  };
  let resolveRead: ((item: Idea) => void) | undefined;
  mockIPC(
    () =>
      new Promise<Idea>((resolve) => {
        resolveRead = resolve;
      }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['idea', 'detail', 'i1'], old);
  await client.invalidateQueries({ queryKey: ['idea', 'detail', 'i1'] });
  render(
    <QueryClientProvider client={client}>
      <ContentDetail kind="idea" id="i1" fresh={false} onDelete={() => {}} />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('旧标签')).toBeNull();
  resolveRead?.({ ...old, tags: [{ ...old.tags[0]!, name: '新标签' }] });
  expect(await screen.findByText('新标签')).toBeTruthy();
  expect(screen.queryByText('旧标签')).toBeNull();
  client.clear();
  clearMocks();
});
