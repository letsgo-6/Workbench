import {
  useRef,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { EditorPane } from '@/components/editor/EditorPane';
import type {
  EditorHandle,
  EditorSelection,
} from '@/components/editor/MarkdownEditor';
import type { EntityType } from '@/types/bindings/EntityType';
import type { Draft } from '../content/draft';
import { useAiStore } from './store';
import { SelectionToolbar } from './SelectionToolbar';
export function AiEditor({
  kind,
  id,
  draft,
  setDraft,
  onChange,
}: {
  kind: EntityType;
  id: string;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  onChange: (text: string) => void;
}) {
  const editor = useRef<EditorHandle>(null);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  useEffect(() => {
    const binding = {
      id,
      entityType: kind,
      handle: () => editor.current,
      draft: () => draft,
      apply: (fields: Partial<Draft>) => setDraft((d) => ({ ...d, ...fields })),
    };
    useAiStore.getState().patch({ editor: binding });
    return () => {
      if (useAiStore.getState().editor === binding)
        useAiStore.getState().patch({ editor: null });
    };
  }, [id, kind, draft, setDraft]);
  useEffect(() => {
    const clear = () => setSelection(null);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, []);
  return (
    <>
      <EditorPane
        ref={editor}
        value={draft.body}
        onChange={onChange}
        onSelection={setSelection}
      />
      {selection && (
        <SelectionToolbar
          top={selection.top}
          left={selection.left}
          target={{
            id,
            entityType: kind,
            from: selection.from,
            to: selection.to,
            original: selection.text,
          }}
        />
      )}
    </>
  );
}
