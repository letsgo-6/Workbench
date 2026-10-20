import { useRef, useImperativeHandle, forwardRef } from 'react';
import CodeMirror, {
  type ReactCodeMirrorRef,
  EditorView,
} from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { t } from '@/i18n';
import { isolateHistory } from '@codemirror/commands';
export interface EditorSelection {
  from: number;
  to: number;
  text: string;
  top: number;
  left: number;
}
export interface EditorHandle {
  getSelection(): { from: number; to: number; text: string };
  replaceRange(from: number, to: number, text: string): void;
  insertAfterSelection(text: string): void;
  focus(): void;
}
const theme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--foreground)',
    fontSize: 'var(--editor-font-size, 14px)',
  },
  '.cm-content': {
    fontFamily: 'inherit',
    padding: '20px 0',
    minHeight: '280px',
    caretColor: 'var(--primary)',
  },
  '.cm-gutters': {
    background: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { background: 'var(--accent)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
});
export const MarkdownEditor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    onSelection?: (selection: EditorSelection | null) => void;
  }
>(function MarkdownEditor({ value, onChange, onSelection }, ref) {
  const cm = useRef<ReactCodeMirrorRef>(null);
  useImperativeHandle(
    ref,
    () => ({
      getSelection() {
        const view = cm.current?.view;
        const range = view?.state.selection.main;
        return {
          from: range?.from ?? 0,
          to: range?.to ?? 0,
          text: view && range ? view.state.sliceDoc(range.from, range.to) : '',
        };
      },
      replaceRange(from, to, text) {
        cm.current?.view?.dispatch({
          changes: { from, to, insert: text },
          userEvent: 'input.ai',
          annotations: isolateHistory.of('full'),
        });
      },
      insertAfterSelection(text) {
        const view = cm.current?.view;
        if (view)
          view.dispatch({
            changes: { from: view.state.selection.main.to, insert: text },
            userEvent: 'input.ai',
            annotations: isolateHistory.of('full'),
          });
      },
      focus() {
        cm.current?.view?.focus();
      },
    }),
    [],
  );
  return (
    <CodeMirror
      ref={cm}
      value={value}
      onChange={onChange}
      onUpdate={(update) => {
        if (update.selectionSet || update.docChanged) {
          const r = update.state.selection.main;
          const coords = update.view.coordsAtPos(r.from);
          onSelection?.(
            !r.empty && coords
              ? {
                  from: r.from,
                  to: r.to,
                  text: update.state.sliceDoc(r.from, r.to),
                  top: coords.top,
                  left: coords.left,
                }
              : null,
          );
        }
      }}
      theme={theme}
      extensions={[
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
      ]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      aria-label={t('common.content')}
    />
  );
});
