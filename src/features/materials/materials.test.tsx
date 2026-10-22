import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, mockConvertFileSrc, clearMocks } from '@tauri-apps/api/mocks';
import { MaterialPage } from './MaterialPage';
import { PromptDialog } from './PromptDialog';
import { AssetManager } from './AssetManager';
import { useAiStore } from '../ai/store';
import { urlFromPaste } from './useMaterialImport';
import type { Material } from '@/types/bindings/Material';
import type { MaterialInput } from '@/types/bindings/MaterialInput';
import type { ListQuery } from '@/types/bindings/ListQuery';
import { t } from '@/i18n';
const copy = vi.hoisted(() =>
  vi.fn<(text: string) => Promise<void>>().mockResolvedValue(),
);
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: copy }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock('@/components/editor/EditorPane', () => ({
  EditorPane: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="test note"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/editor/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="test prompt"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
let records: Record<string, Material>;
let calls: { command: string; input: unknown }[];
const clients: QueryClient[] = [];
function material(id: string, kind = 'work', prompt = ''): Material {
  return {
    id,
    kind,
    title: `${kind} ${id}`,
    url: null,
    noteMd: '',
    prompt,
    coverAssetId: null,
    assets: [],
    isStarred: false,
    origin: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    tags: [],
  };
}
beforeEach(() => {
  mockConvertFileSrc('windows');
  records = {
    work: material('work'),
    component: material('component', 'component', '生成音乐播放器'),
  };
  calls = [];
  copy.mockClear();
  useAiStore
    .getState()
    .patch({ job: null, composerText: '', open: false, status: 'idle' });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  mockIPC((command, args) => {
    const input = (args as { input?: unknown }).input;
    calls.push({ command, input });
    if (command === 'settings_get_all') return { appearanceMotion: 'off' };
    if (command === 'tag_list') return [];
    if (command === 'material_list') {
      const query = input as ListQuery;
      const items = Object.values(records).filter(
        (item) => !query.materialKind || item.kind === query.materialKind,
      );
      return {
        items: items.slice(
          query.offset ?? 0,
          (query.offset ?? 0) + (query.limit ?? 60),
        ),
        total: items.length,
      };
    }
    if (command === 'material_get')
      return records[(input as { id: string }).id];
    if (command === 'material_create') {
      const value = input as MaterialInput;
      const id = `new-${Object.keys(records).length}`;
      records[id] = { ...material(id, value.kind), ...value, tags: [] };
      return records[id];
    }
    if (command === 'material_update') {
      const value = input as MaterialInput & { id: string };
      records[value.id] = { ...records[value.id]!, ...value, tags: [] };
      return records[value.id];
    }
    if (command === 'material_discard_empty') {
      const id = (input as { id: string }).id;
      const value = records[id];
      if (
        value &&
        !value.title &&
        !value.url &&
        !value.prompt &&
        !value.noteMd &&
        !value.assets.length
      ) {
        delete records[id];
        return true;
      }
      return false;
    }
    if (command === 'search_query')
      return [
        {
          entityType: 'material',
          id: 'component',
          title: 'component',
          snippet: '',
          updatedAt: 1,
        },
      ];
    if (command === 'link_fetch_title') return 'Dribbble 收藏';
    throw Error(command);
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  clearMocks();
  vi.unstubAllGlobals();
  useAiStore
    .getState()
    .patch({ job: null, composerText: '', open: false, status: 'idle' });
});
function mount(path = '/materials') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/materials/:id?" element={<MaterialPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('switches sections and delegates full-text filtering to material search', async () => {
  mount();
  expect(await screen.findByRole('button', { name: 'work work' })).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'UI 组件 1' }));
  expect(
    await screen.findByRole('button', { name: 'component component' }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t('material.filter')), {
    target: { value: '播放器' },
  });
  await waitFor(() =>
    expect(
      calls.some(
        (call) =>
          call.command === 'search_query' &&
          (call.input as { q: string }).q === 'type:material 播放器',
      ),
    ).toBe(true),
  );
});
it('pastes a URL outside text fields into a new material and fills only an empty title', async () => {
  mount();
  await screen.findByRole('button', { name: 'work work' });
  fireEvent.paste(window, {
    clipboardData: {
      items: [],
      getData: () => 'https://dribbble.com/shots/123',
    },
  });
  const title = await screen.findByLabelText(t('common.title'));
  await waitFor(() =>
    expect((title as HTMLInputElement).value).toBe('Dribbble 收藏'),
  );
  expect(
    calls.find((call) => call.command === 'material_create')?.input,
  ).toMatchObject({ url: 'https://dribbble.com/shots/123', kind: 'work' });
  fireEvent.change(title, { target: { value: '用户标题' } });
  await waitFor(() =>
    expect((title as HTMLInputElement).value).toBe('用户标题'),
  );
  expect(urlFromPaste('javascript:alert(1)')).toBeNull();
  expect(urlFromPaste('https://example.com 多余文字')).toBeNull();
});
it('discards an untouched empty new material when closing its drawer', async () => {
  mount();
  await screen.findByRole('button', { name: 'work work' });
  fireEvent.click(screen.getByRole('button', { name: t('material.addWork') }));
  await screen.findByLabelText(t('common.title'));
  fireEvent.click(screen.getByRole('button', { name: t('material.close') }));
  await waitFor(() =>
    expect(
      calls.some((call) => call.command === 'material_discard_empty'),
    ).toBe(true),
  );
  expect(Object.keys(records)).toHaveLength(2);
});
it('copies a component prompt and stages AI text without sending', async () => {
  const item = material('prompt', 'component', '生成一个按钮');
  const onClose = vi.fn();
  const view = render(
    <PromptDialog item={item} onClose={onClose} onEdit={() => {}} />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: t('material.copyPrompt') }),
  );
  await waitFor(() => expect(copy).toHaveBeenCalledWith('生成一个按钮'));
  expect(onClose).toHaveBeenCalled();
  view.unmount();
  render(<PromptDialog item={item} onClose={() => {}} onEdit={() => {}} />);
  fireEvent.click(
    screen.getByRole('button', { name: t('material.sendPrompt') }),
  );
  expect(useAiStore.getState().composerText).toBe(item.prompt);
  expect(useAiStore.getState().job).toBeNull();
  expect(calls.some((call) => call.command === 'ai_chat')).toBe(false);
});
it('uses the existing variable form before copying a material prompt', async () => {
  const client = new QueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <PromptDialog
        item={material('var', 'component', '生成{{topic}}')}
        onClose={() => {}}
        onEdit={() => {}}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: t('material.copyPrompt') }),
  );
  fireEvent.change(await screen.findByLabelText('topic'), {
    target: { value: '音乐播放器' },
  });
  fireEvent.click(screen.getByRole('button', { name: t('prompt.copyUse') }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith('生成音乐播放器'));
  expect(calls.some((call) => call.command === 'prompt_record_use')).toBe(
    false,
  );
});
it('fills variables before staging a material prompt for AI', async () => {
  const client = new QueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <PromptDialog
        item={material('var-ai', 'component', '生成{{颜色}}按钮')}
        onClose={() => {}}
        onEdit={() => {}}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: t('material.sendPrompt') }),
  );
  expect(useAiStore.getState().composerText).toBe('');
  fireEvent.change(await screen.findByLabelText('颜色'), {
    target: { value: '松绿色' },
  });
  fireEvent.click(screen.getByRole('button', { name: t('ai.sendPrompt') }));
  expect(useAiStore.getState().composerText).toBe('生成松绿色按钮');
  expect(calls.some((call) => call.command === 'ai_chat')).toBe(false);
});
it('keeps a GIF without a thumbnail static in the asset strip when motion is off', () => {
  const client = new QueryClient();
  clients.push(client);
  client.setQueryData(['settings'], { appearanceMotion: 'off' });
  const item = material('gif-off');
  item.assets = [
    {
      id: 'gif',
      mediaKind: 'gif',
      mime: 'image/gif',
      originalName: 'loop.gif',
      path: 'C:/test/loop.gif',
      thumbPath: null,
      missing: false,
      sizeBytes: 10,
      width: 1,
      height: 1,
      durationMs: null,
    },
  ];
  render(
    <QueryClientProvider client={client}>
      <AssetManager
        item={item}
        onSelect={() => {}}
        onAction={async (action) => action()}
        onAdd={() => {}}
        onCover={() => {}}
        onRemoved={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(document.querySelector('.asset-thumb img')).toBeNull();
  expect(screen.getByText('GIF')).toBeTruthy();
});
it('distinguishes the open material from batch selection and clears it on close', async () => {
  mount();
  await screen.findByRole('button', { name: 'work work' });
  fireEvent.click(screen.getByRole('button', { name: '预览 work work' }));
  await screen.findByLabelText(t('common.title'));
  const preview = screen.getByRole('button', { name: '预览 work work' });
  const checkbox = screen.getByLabelText(
    `${t('common.select')} work work`,
  ) as HTMLInputElement;
  expect(preview.getAttribute('aria-current')).toBe('true');
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  expect(preview.getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: t('material.close') }));
  await waitFor(() => expect(preview.getAttribute('aria-current')).toBeNull());
  expect(checkbox.checked).toBe(true);
});
