import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { QuickInput } from '../../home/HomeComposer';
import { useCaptureDraft } from '../draft';
import { item, preview } from '../fixtures';
import { useCaptureProcess } from './store';
import { CaptureProcess } from './CaptureProcess';
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
afterEach(() => {
  clearMocks();
  useCaptureDraft.setState({ value: '' });
  useCaptureProcess.getState().clear();
});
it('Tab reaches every target, Enter sends it, and closing a finished round confirms before clearing', async () => {
  const calls: { command: string; args: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    if (command === 'provider_list') return [{ isDefault: true, hasKey: true }];
    if (command === 'settings_get_all')
      return { captureAutoSave: false, tipsCustomTools: [] };
    if (command === 'tag_list') return [];
    if (command === 'capture_analyze_stream')
      return preview({ items: [item({ kind: 'tip', title: '压缩上下文' })] });
    if (command === 'capture_commit')
      return { refs: [{ entityType: 'tip', id: 'saved' }], createdAt: 1 };
    return null;
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <QuickInput />
    </QueryClientProvider>,
  );
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  const field = screen.getByRole('textbox', { name: '快速输入' });
  await user.click(field);
  for (const name of ['待办', 'Skill', '提示词', 'Agent 技巧'])
    await user
      .keyboard('{Tab}')
      .then(() => expect(screen.getByRole('button', { name })).toBeTruthy());
  await user.type(field, '/compact 可以压缩上下文');
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(
      calls.find((c) => c.command === 'capture_analyze_stream')?.args,
    ).toMatchObject({ input: { target: 'tip' } }),
  );
  await user.click(
    await screen.findByRole('button', { name: '全部保存 Enter' }),
  );
  await user.click(
    await screen.findByRole('button', { name: '查看过程与结果' }),
  );
  expect(screen.getByText('已整理到「Agent 技巧」：压缩上下文')).toBeTruthy();
  expect(screen.getByRole('link', { name: '查看' }).getAttribute('href')).toBe(
    '#/tips/saved',
  );
  await user.click(screen.getByRole('button', { name: '关闭过程栏' }));
  await user.click(await screen.findByRole('button', { name: '确认' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '查看过程与结果' })).toBeNull(),
  );
});
it('running Escape collapses without cancelling; ended Escape confirms and restores focus on cancel', async () => {
  const state = useCaptureProcess.getState();
  state.begin('one', 'skill', '原文');
  state.step('one', { stage: 'streaming' });
  state.setOpen(true);
  render(<CaptureProcess />);
  const user = userEvent.setup();
  await user.keyboard('{Escape}');
  expect(useCaptureProcess.getState()).toMatchObject({
    runId: 'one',
    phase: 'running',
    open: false,
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'AI 正在整理…' }));
  act(() => state.finish('one', 'preview'));
  await user.keyboard('{Escape}');
  await screen.findByRole('alertdialog');
  await user.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '关闭过程栏' }),
    ),
  );
  expect(useCaptureProcess.getState().open).toBe(true);
});
it('new round replaces all old data and ignores late events, saves and undo updates', () => {
  const state = useCaptureProcess.getState();
  state.begin('one', 'skill', '旧原文');
  state.delta('one', '旧输出');
  state.reason('one', '旧推理');
  state.step('one', { stage: 'requesting' });
  state.begin('two', 'todo', '新原文');
  state.delta('one', '迟到');
  state.reason('one', '迟到推理');
  state.finish('one', 'error');
  state.saved('one', [{ kind: 'skill', title: '旧结果', createdAt: 1 }]);
  state.undone('one', 'old');
  expect(useCaptureProcess.getState()).toMatchObject({
    runId: 'two',
    input: '新原文',
    output: '',
    reasoning: '',
    results: [],
    steps: [],
    phase: 'running',
  });
  state.clear();
  expect(useCaptureProcess.getState()).toMatchObject({
    runId: null,
    input: '',
    output: '',
    reasoning: '',
    results: [],
    steps: [],
  });
});
it('shows reasoning separately collapsed, readable partial titles and saved-link summary', async () => {
  const state = useCaptureProcess.getState();
  state.begin('one', 'skill', '原文');
  state.reason('one', '先识别链接');
  state.delta('one', '{"items":[{"type":"skill","title":"半个名称');
  state.setOpen(true);
  render(<CaptureProcess />);
  expect(screen.getByText('识别到：Skill · 半个名称')).toBeTruthy();
  expect(screen.getByText('先识别链接').closest('details')?.open).toBe(false);
  expect(screen.getByText('原始输出').closest('details')?.open).toBe(false);
  act(() =>
    state.saved('one', [
      { kind: 'skill', title: '甲', createdAt: 1, hasLink: true },
      { kind: 'skill', title: '乙', createdAt: 1, hasLink: false },
    ]),
  );
  expect(screen.getByText('整理 2 条到Skill，1 条带链接')).toBeTruthy();
});
it('inactive home process never consumes another page Escape', async () => {
  const state = useCaptureProcess.getState();
  state.begin('one', 'idea', '原文');
  state.finish('one', 'cancelled');
  state.setOpen(true);
  render(<CaptureProcess active={false} />);
  await userEvent.setup().keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(useCaptureProcess.getState().open).toBe(true);
});
it('result undo uses the saved timestamp and marks only its own result', async () => {
  const calls: unknown[] = [];
  mockIPC((command, args) => {
    if (command === 'capture_undo') {
      calls.push(args);
      return { removed: 1, skipped: 0 };
    }
    return null;
  });
  const state = useCaptureProcess.getState();
  state.begin('one', 'skill', '原文');
  state.saved('one', [
    {
      kind: 'skill',
      title: '技能',
      ref: { entityType: 'skill', id: 'saved' },
      createdAt: 123,
    },
  ]);
  state.setOpen(true);
  render(<CaptureProcess />);
  await userEvent.setup().click(screen.getByRole('button', { name: '撤销' }));
  await waitFor(() =>
    expect(useCaptureProcess.getState().results[0]?.undone).toBe(true),
  );
  expect(calls).toEqual([
    { input: { refs: [{ entityType: 'skill', id: 'saved' }], createdAt: 123 } },
  ]);
});
it('typed prefixes select the destination without changing original input', async () => {
  mockIPC((command) => {
    if (command === 'provider_list') return [{ isDefault: true, hasKey: true }];
    if (command === 'settings_get_all') return { captureAutoSave: false };
    return null;
  });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <QuickInput />
    </QueryClientProvider>,
  );
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  const field = screen.getByRole('textbox', { name: '快速输入' });
  await user.click(field);
  await user.keyboard('{Tab}{Tab}{Tab}');
  expect(screen.getByRole('button', { name: '提示词' })).toBeTruthy();
  await user.type(field, '待办：明天交稿');
  expect(screen.getByRole('button', { name: '待办' })).toBeTruthy();
  expect((field as HTMLTextAreaElement).value).toBe('待办：明天交稿');
  client.clear();
});
