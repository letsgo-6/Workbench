import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ExternalLink, Copy, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/common/TagInput';
import { EditorPane } from '@/components/editor/EditorPane';
import {
  MarkdownEditor,
  type EditorHandle,
} from '@/components/editor/MarkdownEditor';
import { desktop } from '@/lib/api/app';
import { variables } from '@/lib/template';
import { t } from '@/i18n';
import { toast } from 'sonner';
import type { Material } from '@/types/bindings/Material';
import type { MaterialInput } from '@/types/bindings/MaterialInput';
import { PromptDialog, stageMaterialPrompt } from './PromptDialog';
export function MaterialTextFields({
  item,
  draft,
  setDraft,
  focusPrompt,
}: {
  item: Material;
  draft: MaterialInput;
  setDraft: Dispatch<SetStateAction<MaterialInput>>;
  focusPrompt: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const prompt = useRef<EditorHandle>(null);
  useEffect(() => {
    if (focusPrompt) prompt.current?.focus();
  }, [focusPrompt]);
  const update = <K extends keyof MaterialInput>(
    key: K,
    value: MaterialInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <>
      {' '}
      <label className="material-field">
        <span>{t('common.url')}</span>
        <div className="material-url-row">
          <Input
            type="url"
            value={draft.url ?? ''}
            onChange={(event) => update('url', event.target.value || null)}
          />
          <Button
            size="icon-sm"
            variant="outline"
            disabled={!draft.url}
            aria-label={t('material.open')}
            onClick={() => {
              if (draft.url)
                void desktop
                  .openUrl(draft.url)
                  .catch((error: Error) => toast.error(error.message));
            }}
          >
            <ExternalLink />
          </Button>
        </div>
      </label>
      <label className="material-field">
        <span>{t('common.tags')}</span>
        <TagInput
          value={draft.tags}
          onChange={(tags) => update('tags', tags)}
          id={`material-tags-${item.id}`}
        />
      </label>
      <section className="material-note">
        <h3>{t('material.note')}</h3>
        <EditorPane
          value={draft.noteMd}
          onChange={(value) => update('noteMd', value)}
        />
      </section>
      {draft.kind === 'component' && (
        <section className="material-prompt-editor">
          <h3>{t('material.promptField')}</h3>
          <MarkdownEditor
            ref={prompt}
            value={draft.prompt}
            onChange={(value) => update('prompt', value)}
          />
          {variables(draft.prompt).length > 0 && (
            <p className="muted">
              {t('prompt.variables')}: {variables(draft.prompt).join(' · ')}
            </p>
          )}
          <div className="toolbar-actions">
            <Button
              variant="outline"
              disabled={!draft.prompt.trim()}
              onClick={() => {
                if (variables(draft.prompt).length) setShowPrompt(true);
                else
                  void desktop
                    .copy(draft.prompt)
                    .then(() => toast.success(t('common.copied')))
                    .catch((error: Error) => toast.error(error.message));
              }}
            >
              <Copy />
              {t('material.copyPrompt')}
            </Button>
            <Button
              variant="ghost"
              disabled={!draft.prompt.trim()}
              onClick={() => {
                if (variables(draft.prompt).length) setShowPrompt(true);
                else stageMaterialPrompt(draft.prompt);
              }}
            >
              <MessageSquare />
              {t('material.sendPrompt')}
            </Button>
          </div>
        </section>
      )}
      {showPrompt && (
        <PromptDialog
          item={{ ...item, title: draft.title, prompt: draft.prompt }}
          onClose={() => setShowPrompt(false)}
          onEdit={() => {
            setShowPrompt(false);
            prompt.current?.focus();
          }}
        />
      )}
    </>
  );
}
