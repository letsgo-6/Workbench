import { it, expect, vi, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, isolateHistory } from '@codemirror/commands';
import { useAiStore, type EditorBinding } from './store';
import { emptyDraft } from '../content/draft';
import { writeResult } from './apply';
afterEach(() => useAiStore.getState().patch({ editor: null }));
it('AI replacements use a history transaction, are undoable and reject stale source', async () => {
  const view = new EditorView({
    state: EditorState.create({ doc: '原文文字', extensions: [history()] }),
    parent: document.body,
  });
  const binding: EditorBinding = {
    id: 'a',
    entityType: 'idea',
    draft: () => ({ ...emptyDraft('idea'), body: view.state.doc.toString() }),
    apply: vi.fn(),
    handle: () => ({
      getSelection: () => ({ from: 0, to: 2, text: '原文' }),
      focus: () => {},
      insertAfterSelection: () => {},
      replaceRange: (from, to, text) =>
        view.dispatch({
          changes: { from, to, insert: text },
          userEvent: 'input.ai',
          annotations: isolateHistory.of('full'),
        }),
    }),
  };
  useAiStore.getState().patch({ editor: binding });
  await writeResult(
    { id: 'a', entityType: 'idea', from: 0, to: 2, original: '原文' },
    '润色',
    false,
  );
  expect(view.state.doc.toString()).toBe('润色文字');
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe('原文文字');
  await expect(
    writeResult(
      { id: 'a', entityType: 'idea', from: 0, to: 2, original: '旧文' },
      '错误覆盖',
      false,
    ),
  ).rejects.toThrow();
  expect(view.state.doc.toString()).toBe('原文文字');
  view.destroy();
});
