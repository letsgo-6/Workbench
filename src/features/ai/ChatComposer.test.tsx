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
import { ChatComposer } from './ChatComposer';
import { useAiStore } from './store';
afterEach(() => {
  cleanup();
  clearMocks();
  useAiStore
    .getState()
    .patch({ job: null, messages: [], conversationId: null, status: 'idle' });
});
it('selects backend search references as chips and sends only their identities', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockIPC((command) => {
    if (command === 'search_query')
      return [
        {
          entityType: 'idea',
          id: 'source-1',
          title: '来源一',
          snippet: '不应直接作为上下文发送',
          updatedAt: 1,
        },
      ];
    throw Error(command);
  });
  render(
    <QueryClientProvider client={client}>
      <ChatComposer />
    </QueryClientProvider>,
  );
  const question = screen.getByLabelText('向 AI 提问…');
  fireEvent.change(question, { target: { value: '@来源' } });
  fireEvent.click(await screen.findByRole('button', { name: '灵感 · 来源一' }));
  expect(screen.getByRole('button', { name: '移除引用 来源一' })).toBeTruthy();
  fireEvent.change(question, { target: { value: '请比较' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await waitFor(() => expect(useAiStore.getState().job?.mode).toBe('chat'));
  const job = useAiStore.getState().job;
  expect(job && job.mode === 'chat' && job.refs).toEqual([
    { entityType: 'idea', id: 'source-1' },
  ]);
  expect(job && job.mode === 'chat' && job.messages.at(-1)?.content).toBe(
    '请比较',
  );
  client.clear();
});
