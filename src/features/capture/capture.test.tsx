import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { toast } from 'sonner';
import { QuickInput } from '../home/HomeComposer';
import { useCaptureDraft } from './draft';
import { item, preview } from './fixtures';
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
type Call = { command: string; args: unknown };
let calls: Call[];
let response: ReturnType<typeof preview>;
let autoSave: boolean;
let available: boolean;
let handler: ((command: string) => unknown) | null;
let clients: QueryClient[];
beforeEach(() => {
  calls = [];
  clients = [];
  response = preview();
  autoSave = false;
  available = true;
  handler = null;
  useCaptureDraft.setState({ value: '' });
  vi.clearAllMocks();
  mockIPC((command, args) => {
    calls.push({ command, args });
    const override = handler?.(command);
    if (override !== undefined) return override;
    if (command === 'provider_list')
      return available ? [{ isDefault: true, hasKey: true }] : [];
    if (command === 'settings_get_all')
      return {
        captureDefaultTarget: 'idea',
        captureAutoSave: autoSave,
        tipsCustomTools: [],
      };
    if (command === 'tag_list') return [];
    if (command === 'capture_analyze_stream') return response;
    if (command === 'capture_commit')
      return { refs: [{ entityType: 'todo', id: 'saved' }], createdAt: 100 };
    if (command === 'capture_undo') return { removed: 1, skipped: 0 };
    if (command === 'link_fetch_title') return '自动名称';
    return { id: 'saved' };
  });
});
afterEach(() => {
  clearMocks();
  clients.forEach((client) => client.clear());
  useCaptureDraft.setState({ value: '' });
});
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  clients.push(client);
  return {
    ...render(
      <QueryClientProvider client={client}>
        <QuickInput />
      </QueryClientProvider>,
    ),
    client,
  };
}
const field = () => screen.getByRole('textbox', { name: '快速输入' });
async function start(text = '明天下午3点交周报') {
  mount();
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  await user.type(field(), text);
  await user.keyboard('{Enter}');
  return user;
}
it('analyzes, previews, edits and commits; clears input only after successful save', async () => {
  const user = await start();
  expect(
    calls.find((c) => c.command === 'capture_analyze_stream')?.args,
  ).toMatchObject({ input: { text: '明天下午3点交周报' } });
  const title = await screen.findByRole('textbox', { name: '标题' });
  await user.clear(title);
  await user.type(title, '编辑后的标题');
  expect((field() as HTMLTextAreaElement).value).toBe('明天下午3点交周报');
  await user.click(screen.getByRole('button', { name: '全部保存 Enter' }));
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'capture_commit')).toBe(true),
  );
  expect(calls.find((c) => c.command === 'capture_commit')?.args).toMatchObject(
    { input: { items: [{ title: '编辑后的标题' }] } },
  );
  await waitFor(() => expect((field() as HTMLTextAreaElement).value).toBe(''));
});
it('Ctrl+Enter bypasses analysis and directly creates an idea', async () => {
  mount();
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  await user.type(field(), '保持原文');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'idea_create')).toBe(true),
  );
  expect(calls.some((c) => c.command === 'capture_analyze_stream')).toBe(false);
  expect(calls.find((c) => c.command === 'idea_create')?.args).toMatchObject({
    input: { contentMd: '保持原文' },
  });
});
it('Esc cancels, retains input and ignores a late eligible result', async () => {
  let finish: (value: ReturnType<typeof preview>) => void = () => {};
  handler = (c) =>
    c === 'capture_analyze_stream'
      ? new Promise((r) => {
          finish = r;
        })
      : undefined;
  const user = await start();
  await screen.findByText('正在整理…');
  expect((field() as HTMLTextAreaElement).readOnly).toBe(true);
  expect((field() as HTMLTextAreaElement).disabled).toBe(false);
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'ai_cancel')).toBe(true),
  );
  await act(async () => {
    finish(preview());
  });
  expect((field() as HTMLTextAreaElement).value).toBe('明天下午3点交周报');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(calls.some((c) => c.command === 'capture_commit')).toBe(false);
});
it.each(['NETWORK', 'AI_AUTH', 'AI_ENDPOINT'])(
  'failure %s retains input and allows manual idea fallback',
  async (code) => {
    handler = (c) =>
      c === 'capture_analyze_stream' ? Promise.reject({ code }) : undefined;
    const user = await start();
    await screen.findByRole('alert');
    expect((field() as HTMLTextAreaElement).value).toBe('明天下午3点交周报');
    expect(Boolean(screen.queryByRole('link', { name: '去设置' }))).toBe(
      code !== 'NETWORK',
    );
    await user.click(screen.getByRole('button', { name: '存为灵感' }));
    await waitFor(() =>
      expect((field() as HTMLTextAreaElement).value).toBe(''),
    );
    expect(calls.find((c) => c.command === 'idea_create')?.args).toMatchObject({
      input: { contentMd: '明天下午3点交周报' },
    });
  },
);
it('reliable automatic saving has an eight-second undo action', async () => {
  autoSave = true;
  await start();
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '全部保存 Enter' })).toBeNull();
  expect(calls.some((c) => c.command === 'capture_commit')).toBe(true);
  const options = vi.mocked(toast.success).mock.calls[0]?.[1];
  expect(options?.duration).toBe(8000);
  const undo = options?.cancel;
  expect(undo && typeof undo === 'object' && 'onClick' in undo).toBe(true);
  if (
    undo &&
    typeof undo === 'object' &&
    'onClick' in undo &&
    typeof undo.onClick === 'function'
  ) {
    undo.onClick({} as React.MouseEvent<HTMLButtonElement>);
  }
  await waitFor(() =>
    expect(calls.find((c) => c.command === 'capture_undo')?.args).toEqual({
      input: { refs: [{ entityType: 'todo', id: 'saved' }], createdAt: 100 },
    }),
  );
});
it('AI dates and low confidence require confirmation and display warnings', async () => {
  autoSave = true;
  response = preview({
    autoSaveEligible: false,
    partialCoverage: true,
    truncated: true,
    items: [
      item({
        dateSource: 'ai',
        confidence: 'low',
        warnings: ['dateFromAi', 'lowConfidence'],
      }),
    ],
  });
  await start();
  await screen.findByRole('button', { name: '全部保存 Enter' });
  expect(screen.getAllByText(/AI 推断，请核对/)).toHaveLength(2);
  expect(screen.getByText('有需要确认的内容，未自动保存。')).toBeTruthy();
  expect(screen.getByText('部分原文可能没有被整理进去，请核对。')).toBeTruthy();
  expect(screen.getByText('输入过长，只分析了前面的内容。')).toBeTruthy();
  expect(calls.some((c) => c.command === 'capture_commit')).toBe(false);
});
it('no usable model retains the original two-mode Tab behavior, including after configuration changes', async () => {
  available = false;
  const { client } = mount();
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'provider_list')).toBe(true),
  );
  const user = userEvent.setup();
  await user.click(field());
  await user.keyboard('{Tab}');
  expect(screen.getByRole('button', { name: '待办' })).toBeTruthy();
  await user.keyboard('{Tab}');
  expect(screen.getByRole('button', { name: '灵感' })).toBeTruthy();
  expect(screen.queryByPlaceholderText(/AI 会整理/)).toBeNull();
  available = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['provider'] });
  });
  expect(screen.getByRole('button', { name: '灵感' })).toBeTruthy();
});
it('preview Enter saves from a single-line field, but textarea Enter adds a line; Ctrl+Enter saves anywhere', async () => {
  response = preview({
    items: [item({ kind: 'idea', body: '原文', date: '2026-10-20' })],
  });
  const user = await start();
  const body = await screen.findByRole('textbox', { name: '正文' });
  await user.click(body);
  await user.keyboard('{Enter}');
  expect(calls.some((c) => c.command === 'capture_commit')).toBe(false);
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'capture_commit')).toBe(true),
  );
});
it('commit failures retain the input and edited preview; blank todo titles prevent saving', async () => {
  handler = (c) =>
    c === 'capture_commit' ? Promise.reject({ code: 'DB' }) : undefined;
  const user = await start();
  const title = await screen.findByRole('textbox', { name: '标题' });
  await user.clear(title);
  expect(
    (
      screen.getByRole('button', {
        name: '全部保存 Enter',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.type(title, '重新填写');
  await user.keyboard('{Enter}');
  await screen.findByRole('alert');
  expect((title as HTMLInputElement).value).toBe('重新填写');
  expect((field() as HTMLTextAreaElement).value).toBe('明天下午3点交周报');
});
it('preview removal disables an empty batch, cancel preserves text, and IME input never submits', async () => {
  const user = await start();
  await screen.findByRole('button', { name: '移除' });
  await user.click(screen.getByRole('button', { name: '移除' }));
  expect(
    (
      screen.getByRole('button', {
        name: '全部保存 Enter',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect((field() as HTMLTextAreaElement).value).toBe('明天下午3点交周报');
  const count = calls.filter(
    (c) => c.command === 'capture_analyze_stream',
  ).length;
  fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
  expect(
    calls.filter((c) => c.command === 'capture_analyze_stream'),
  ).toHaveLength(count);
});
it('skill name fetches safely and type changes retain source and fields', async () => {
  response = preview({
    items: [
      item({
        kind: 'skill',
        title: '',
        url: 'https://example.com',
        skillContent: '---\nname: test\n---',
      }),
    ],
  });
  const user = await start();
  const title = await screen.findByRole('textbox', { name: '名称' });
  await waitFor(() =>
    expect((title as HTMLInputElement).value).toBe('自动名称'),
  );
  expect(screen.getByText('已识别 SKILL.md 内容')).toBeTruthy();
  const card = screen.getByRole('article');
  await user.click(within(card).getByRole('radio', { name: '提示词库' }));
  expect(
    (screen.getByRole('textbox', { name: '正文' }) as HTMLTextAreaElement)
      .value,
  ).toBe('明天下午3点交周报');
});
it('unmount cancels analysis and keeps the unsaved draft for the next visit', async () => {
  handler = (c) =>
    c === 'capture_analyze_stream' ? new Promise(() => {}) : undefined;
  const { unmount } = mount();
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  await user.type(field(), '暂存原文');
  await user.keyboard('{Enter}');
  await screen.findByText('正在整理…');
  unmount();
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'ai_cancel')).toBe(true),
  );
  mount();
  expect((field() as HTMLTextAreaElement).value).toBe('暂存原文');
});
it('Ctrl+Enter commits a tag that is still being typed', async () => {
  const user = await start();
  const tags = await screen.findByPlaceholderText('输入或选择标签，回车添加');
  await user.type(tags, '新标签');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() =>
    expect(
      calls.find((c) => c.command === 'capture_commit')?.args,
    ).toMatchObject({ input: { items: [{ tags: ['新标签'] }] } }),
  );
});
it('failure fallback can save a today todo, and editing dismisses the error', async () => {
  handler = (c) =>
    c === 'capture_analyze_stream'
      ? Promise.reject({ code: 'NETWORK' })
      : undefined;
  const user = await start();
  await screen.findByRole('alert');
  await user.type(field(), '补充');
  expect(screen.queryByRole('alert')).toBeNull();
  await user.keyboard('{Enter}');
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: '存为待办' }));
  await waitFor(() =>
    expect(calls.find((c) => c.command === 'todo_create')?.args).toMatchObject({
      input: { title: '明天下午3点交周报补充', priority: 2 },
    }),
  );
});
it('CANCELLED is silent and removing the active model returns to manual mode', async () => {
  handler = (c) =>
    c === 'capture_analyze_stream'
      ? Promise.reject({ code: 'CANCELLED' })
      : undefined;
  const { client } = mount();
  await screen.findByPlaceholderText(/AI 会整理/);
  const user = userEvent.setup();
  await user.type(field(), '保留原文');
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect((field() as HTMLTextAreaElement).readOnly).toBe(false),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  available = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['provider'] });
  });
  await waitFor(() =>
    expect(screen.queryByPlaceholderText(/AI 会整理/)).toBeNull(),
  );
  expect((field() as HTMLTextAreaElement).value).toBe('保留原文');
});
it('unusable or malformed provider lists stay manual', async () => {
  for (const providers of [
    { id: 'bad' },
    [{ isDefault: true, hasKey: false }],
    [{ isDefault: false, hasKey: true }],
  ]) {
    handler = (c) => (c === 'provider_list' ? providers : undefined);
    const { unmount } = mount();
    await waitFor(() =>
      expect(calls.some((c) => c.command === 'provider_list')).toBe(true),
    );
    expect(screen.queryByPlaceholderText(/AI 会整理/)).toBeNull();
    unmount();
  }
});
it('uses the configured default destination, and an explicit choice survives settings refresh', async () => {
  handler = (command) =>
    command === 'settings_get_all'
      ? { captureDefaultTarget: 'material', captureAutoSave: false }
      : undefined;
  const { client } = mount();
  await screen.findByRole('button', { name: '作品素材库' });
  const user = userEvent.setup();
  await user.click(field());
  await user.keyboard('{Tab}');
  expect(screen.getByRole('button', { name: '灵感' })).toBeTruthy();
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['settings'] });
  });
  expect(screen.getByRole('button', { name: '灵感' })).toBeTruthy();
  await user.type(field(), '随手记录');
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(
      calls.find((c) => c.command === 'capture_analyze_stream')?.args,
    ).toMatchObject({ input: { target: 'idea' } }),
  );
});
it('material URL title fetch only affects preview and cannot overwrite a user title', async () => {
  let complete: (title: string) => void = () => {};
  handler = (command) =>
    command === 'link_fetch_title'
      ? new Promise<string>((resolve) => {
          complete = resolve;
        })
      : undefined;
  response = preview({
    items: [
      item({
        kind: 'material',
        source: 'https://example.com',
        body: 'https://example.com',
        title: '',
        url: 'https://example.com',
        materialKind: 'work',
      }),
    ],
  });
  const user = await start('https://example.com');
  const title = await screen.findByRole('textbox', { name: '标题' });
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'link_fetch_title')).toBe(true),
  );
  await user.type(title, '我的标题');
  await act(async () => complete('网页标题'));
  expect((title as HTMLInputElement).value).toBe('我的标题');
  expect(calls.some((c) => c.command === 'capture_commit')).toBe(false);
});
it('material URL with no title gets a title in preview', async () => {
  response = preview({
    items: [
      item({
        kind: 'material',
        title: '',
        url: 'https://example.com',
        materialKind: 'work',
      }),
    ],
  });
  await start('https://example.com');
  const title = await screen.findByRole('textbox', { name: '标题' });
  await waitFor(() =>
    expect((title as HTMLInputElement).value).toBe('自动名称'),
  );
});
