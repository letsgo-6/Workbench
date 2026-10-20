import { useState, forwardRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  MarkdownEditor,
  type EditorHandle,
  type EditorSelection,
} from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { t } from '@/i18n';
type Mode = 'edit' | 'preview' | 'split';
export const EditorPane = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    onSelection?: (selection: EditorSelection | null) => void;
  }
>(function EditorPane({ value, onChange, onSelection }, ref) {
  const [mode, setMode] = useState<Mode>(() => {
    const value = localStorage.getItem('editor-mode');
    return value === 'split' || value === 'preview' ? value : 'edit';
  });
  return (
    <section className="editor-pane">
      <div className="editor-toolbar">
        <span>{t('common.content')}</span>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value === 'edit' || value === 'preview' || value === 'split') {
              setMode(value);
              localStorage.setItem('editor-mode', value);
            }
          }}
          aria-label={t('common.content')}
        >
          {(['edit', 'preview', 'split'] as const).map((key) => (
            <ToggleGroupItem key={key} value={key} size="sm">
              {t(`common.${key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className={`editor-body ${mode}`}>
        <div hidden={mode === 'preview'}>
          <MarkdownEditor
            ref={ref}
            value={value}
            onChange={onChange}
            onSelection={onSelection}
          />
        </div>
        {mode !== 'edit' && <MarkdownPreview value={value} />}
      </div>
    </section>
  );
});
