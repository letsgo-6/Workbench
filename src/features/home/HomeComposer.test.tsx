import { it, expect } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { QuickInput } from './HomeComposer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCaptureDraft } from '../capture/draft';
import { preview } from '../capture/fixtures';
it('Tab switches to a today todo and Enter persists via IPC', async () => {
  const calls: { command: string; input: unknown }[] = [];
  mockIPC((command, args) => {
    if (command === 'provider_list') return [];
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
it('leaving the persistent home cancels analysis and retains input without late auto-save', async () => {
  const calls: string[] = [];
  let complete: (value: ReturnType<typeof preview>) => void = () => {};
  const response = new Promise<ReturnType<typeof preview>>((resolve) => {
    complete = resolve;
  });
  mockIPC((command) => {
    calls.push(command);
    if (command === 'provider_list')
      return [
        {
          id: 'p',
          name: '测试',
          model: 'model',
          isDefault: true,
          hasKey: true,
        },
      ];
    if (command === 'settings_get_all')
      return { captureDefaultTarget: 'idea', captureAutoSave: true };
    if (command === 'capture_analyze_stream') return response;
    return null;
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (active: boolean) => (
    <QueryClientProvider client={client}>
      <QuickInput active={active} />
    </QueryClientProvider>
  );
  const view = render(content(true));
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup(),
    input = screen.getByRole('textbox', { name: '快速输入' });
  await user.type(input, '导航前保留的原文');
  await user.keyboard('{Enter}');
  await waitFor(() => expect(calls).toContain('capture_analyze_stream'));
  view.rerender(content(false));
  await waitFor(() => expect(calls).toContain('ai_cancel'));
  await act(async () => complete({ ...preview(), autoSaveEligible: true }));
  expect(calls).not.toContain('capture_commit');
  expect((input as HTMLTextAreaElement).value).toBe('导航前保留的原文');
  view.rerender(content(true));
  expect((input as HTMLTextAreaElement).readOnly).toBe(false);
  view.unmount();
  client.clear();
  clearMocks();
  useCaptureDraft.setState({ value: '' });
});
