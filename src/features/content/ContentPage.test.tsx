import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { ContentPage } from './ContentPage';
import type { Entry } from '@/lib/api/content';
import { t } from '@/i18n';
vi.mock('@/app/layout/ThreePane', () => ({
  ThreePane: ({ list }: { list: React.ReactNode }) => <div>{list}</div>,
}));
vi.mock('./ContentTools', () => ({ ContentTools: () => null }));
vi.mock('./ContentList', () => ({
  ContentList: ({ items }: { items: Entry[] }) => (
    <div>
      {items.map((item) => (
        <p key={item.id}>{'title' in item ? item.title : item.id}</p>
      ))}
    </div>
  ),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  clearMocks();
});
it('clears an unsuccessful search and server filters without creating a record', async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === 'tip_list')
      return {
        total: 1,
        items: [
          {
            id: 'tip',
            title: '保留原始记录',
            contentMd: '用户正文',
            tools: [],
            tags: [],
            isStarred: false,
          },
        ],
      };
    if (command === 'tag_list')
      return [{ id: 'tag', name: '设计', useCount: 1, color: null }];
    if (command === 'settings_get_all') return { tipsCustomTools: [] };
    throw Error(command);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tips']}>
        <ContentPage kind="tip" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('保留原始记录');
  fireEvent.change(screen.getByLabelText(t('common.tags')), {
    target: { value: '设计' },
  });
  fireEvent.click(screen.getByLabelText(t('common.starred')));
  fireEvent.change(screen.getByLabelText(t('common.filter')), {
    target: { value: '不存在的内容' },
  });
  await screen.findByText(t('common.noMatches'));
  fireEvent.click(
    screen.getByRole('button', { name: t('common.clearFilters') }),
  );
  expect(await screen.findByText('保留原始记录')).toBeTruthy();
  expect(
    (screen.getByLabelText(t('common.filter')) as HTMLInputElement).value,
  ).toBe('');
  expect(
    (screen.getByLabelText(t('common.tags')) as HTMLSelectElement).value,
  ).toBe('');
  expect(
    screen.getByLabelText(t('common.starred')).getAttribute('aria-pressed'),
  ).toBe('false');
  expect(commands).not.toContain('tip_create');
});
