import { it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';
import { QuickCapture } from './QuickCapture';
afterEach(async () => {
  await act(async () => cleanup());
  clearMocks();
});
function setup(fail = false) {
  const calls: { command: string; args: unknown }[] = [];
  mockWindows('quick');
  mockIPC(
    (command, args) => {
      calls.push({ command, args });
      if (command === 'settings_get_all') return { appearanceTheme: 'system' };
      if (command === 'idea_create' && fail) throw new Error('write failed');
      return { id: 'saved' };
    },
    { shouldMockEvents: true },
  );
  return calls;
}
it('Enter stores an idea, Ctrl+Enter stores a today todo, Shift+Enter creates a line and Esc hides', async () => {
  const calls = setup();
  const user = userEvent.setup();
  render(<QuickCapture />);
  const input = screen.getByRole('textbox');
  await user.type(input, '灵感');
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'idea_create')).toBe(true),
  );
  await user.type(input, '待办');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'todo_create')).toBe(true),
  );
  const todo = calls.find((c) => c.command === 'todo_create');
  expect(todo?.args).toMatchObject({
    input: {
      title: '待办',
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    },
  });
  await user.type(input, '第一行');
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect((input as HTMLTextAreaElement).value).toContain('\n');
  await user.keyboard('{Escape}');
  expect(calls.some((c) => c.command === 'plugin:window|hide')).toBe(true);
});
it('failed save keeps the user content and exposes an error', async () => {
  setup(true);
  const user = userEvent.setup();
  render(<QuickCapture />);
  const input = screen.getByRole('textbox');
  await user.type(input, '不能丢失');
  await user.keyboard('{Enter}');
  await screen.findByRole('alert');
  expect((input as HTMLTextAreaElement).value).toBe('不能丢失');
});
