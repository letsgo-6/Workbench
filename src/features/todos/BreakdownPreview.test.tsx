import { it, expect, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { BreakdownPreview } from './BreakdownPreview';
afterEach(() => {
  cleanup();
  clearMocks();
});
it('does not create AI suggestions until reviewed, and sends edited values only once', async () => {
  const sent: unknown[] = [];
  mockIPC((command, args) => {
    if (command === 'todo_create_batch') {
      sent.push(args && 'input' in args ? args.input : undefined);
      return [{ id: 'new' }];
    }
    throw Error(command);
  });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BreakdownPreview
        initial={[
          { title: '原建议', note: '备注', dueDate: null, priority: 2 },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(sent).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('标题 1'), {
    target: { value: '审核后标题' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认创建待办' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toEqual([
    {
      title: '审核后标题',
      noteMd: '备注',
      dueDate: null,
      priority: 2,
      sortOrder: 0,
      parentId: null,
      remindAt: null,
      tags: [],
    },
  ]);
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: '确认创建待办' })
        .hasAttribute('disabled'),
    ).toBe(true),
  );
  client.clear();
});
it('rejects an empty title and supports removing unwanted suggestions', () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <BreakdownPreview
        initial={[{ title: '', note: '', dueDate: null, priority: 2 }]}
      />
    </QueryClientProvider>,
  );
  expect(
    screen
      .getByRole('button', { name: '确认创建待办' })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '移除建议' }));
  expect(screen.queryByLabelText('标题 1')).toBeNull();
  client.clear();
});
