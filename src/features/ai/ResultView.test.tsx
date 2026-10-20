import { it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { ResultView } from './ResultView';
import { useAiStore } from './store';
import { emptyDraft } from '../content/draft';
afterEach(() => {
  clearMocks();
  useAiStore.getState().patch({ editor: null });
});
it('applying an idea title inserts a Markdown heading through the editor transaction', async () => {
  const replaceRange = vi.fn();
  const apply = vi.fn();
  mockIPC(() => ({
    kind: 'json',
    text: '',
    changes: null,
    title: '建议标题',
    description: null,
    tags: [],
    valid: true,
  }));
  useAiStore.getState().patch({
    editor: {
      id: 'i',
      entityType: 'idea',
      draft: () => ({ ...emptyDraft('idea'), body: '原文' }),
      apply,
      handle: () => ({
        getSelection: () => ({ from: 0, to: 2, text: '原文' }),
        replaceRange,
        insertAfterSelection: () => {},
        focus: () => {},
      }),
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResultView
        job={{
          id: 'idea-title',
          mode: 'action',
          providerId: null,
          action: 'title_tags',
          input: { kind: 'text', text: '原文' },
          target: {
            id: 'i',
            entityType: 'idea',
            from: 0,
            to: 2,
            original: '原文',
          },
        }}
        text="{}"
        status="done"
        regenerate={() => {}}
      />
    </QueryClientProvider>,
  );
  await screen.findByText('建议标题');
  expect(replaceRange).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '应用所选字段' }));
  expect(replaceRange).toHaveBeenCalledWith(0, 0, '# 建议标题\n\n');
});
it('structured results never change a draft before explicit Apply', async () => {
  const apply = vi.fn();
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === 'ai_parse_result')
      return {
        kind: 'json',
        text: '',
        changes: null,
        title: '建议标题',
        description: null,
        tags: ['已有标签'],
        valid: true,
      };
  });
  useAiStore.getState().patch({
    editor: {
      id: 'p',
      entityType: 'prompt',
      handle: () => null,
      draft: () => ({ ...emptyDraft('prompt'), body: '原文', tags: [] }),
      apply,
    },
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ResultView
        job={{
          id: 'j',
          providerId: null,
          mode: 'action',
          action: 'title_tags',
          input: { kind: 'text', text: '原文' },
          target: {
            id: 'p',
            entityType: 'prompt',
            from: 0,
            to: 2,
            original: '原文',
          },
        }}
        text={'{"title":"建议标题"}'}
        status="done"
        regenerate={() => {}}
      />
    </QueryClientProvider>,
  );
  await screen.findByText('建议标题');
  expect(apply).not.toHaveBeenCalled();
  expect(commands).toEqual(['ai_parse_result']);
  await userEvent.click(screen.getByRole('button', { name: '应用所选字段' }));
  expect(apply).toHaveBeenCalledWith({ title: '建议标题', tags: ['已有标签'] });
});
