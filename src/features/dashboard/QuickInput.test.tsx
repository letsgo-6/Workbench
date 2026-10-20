import { it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { QuickInput } from './QuickInput';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
it('Tab switches to a today todo and Enter persists via IPC', async () => {
  const calls: { command: string; input: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, input: args });
    return { id: 'test' };
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickInput />
    </QueryClientProvider>,
  );
  const field = screen.getByRole('textbox');
  await user.type(field, '写课程总结');
  await user.keyboard('{Tab}{Enter}');
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]?.command).toBe('todo_create');
  expect(calls[0]?.input).toMatchObject({
    input: { title: '写课程总结', priority: 2 },
  });
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  clearMocks();
});
