import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Star, Trash2, Copy, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { AiEditor } from '../ai/AiEditor';
import { AiMenu } from '../ai/AiMenu';
import { TagInput } from '@/components/common/TagInput';
import { SaveIndicator } from '@/components/common/SaveIndicator';
import { useAutosave } from '@/hooks/useAutosave';
import { fromEntry, isBlank, toInput, type Draft } from './draft';
import { type Entry, contentApi, routes } from '@/lib/api/content';
import { appApi, desktop } from '@/lib/api/app';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { DetailFields } from './DetailFields';
import { useAction } from './hooks';
import { PromptActions } from '../prompts/PromptActions';
import { PromptVersions } from '../prompts/PromptVersions';
import { usePromptSession } from '../prompts/usePromptSession';
import { Subtasks } from '../todos/Subtasks';
import { SkillActions } from '../skills/SkillActions';
import { useAiStore } from '../ai/store';
import { toast } from 'sonner';
export function EntryDetail({
  kind,
  item,
  fresh,
  onDelete,
}: {
  kind: EntityType;
  item: Entry;
  fresh: boolean;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(() => fromEntry(item, kind));
  const navigate = useNavigate();
  const { status, flush, controller } = useAutosave(draft, (d) =>
    contentApi(kind).update(item.id, toInput(kind, d)),
  );
  usePromptSession(kind, item.id, controller);
  const action = useAction(async (run: () => Promise<unknown>) => {
    await flush();
    return run();
  });
  useEffect(
    () => () => {
      if (fresh)
        void controller
          .flush()
          .then(async () => {
            if (isBlank(kind, controller.value))
              await appApi.purge({ entityType: kind, id: item.id });
          })
          .catch((error: Error) => toast.error(error.message));
    },
    [controller, fresh, kind, item.id],
  );
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function bodyChange(body: string) {
    update('body', body);
    if (kind === 'skill' && body.trimStart().startsWith('---'))
      void appApi
        .parse(body)
        .then((parsed) =>
          setDraft((d) =>
            d.body === body
              ? {
                  ...d,
                  title: d.title || parsed.name || '',
                  description: d.description || parsed.description || '',
                }
              : d,
          ),
        )
        .catch(() => {});
  }
  const run = (fn: () => Promise<unknown>) => action.mutate(fn);
  return (
    <div className="entry-detail">
      <header className="detail-top">
        <SaveIndicator status={status} retry={() => run(flush)} />
        <div className="toolbar-actions">
          <AiMenu refs={[{ entityType: kind, id: item.id }]} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(item.isStarred ? 'common.unstar' : 'common.star')}
            onClick={() =>
              run(() => contentApi(kind).star(item.id, !item.isStarred))
            }
          >
            <Star fill={item.isStarred ? 'currentColor' : 'none'} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.copy')}
            onClick={() =>
              run(async () => {
                await desktop.copy(draft.body);
                toast.success(t('common.copied'));
              })
            }
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.delete')}
            disabled={'isSystemTemplate' in item && item.isSystemTemplate}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </header>
      <div className="detail-scroll">
        <div className="detail-workspace">
          <div className="detail-writing">
            {'converted' in item && item.converted.length > 0 && (
              <p className="origin">
                {t('common.converted')}
                {item.converted.map((ref) => (
                  <Link
                    key={ref.id}
                    to={`/${routes[ref.entityType]}/${ref.id}`}
                  >
                    {t(`nav.${ref.entityType}`)}
                    <ArrowRight />
                  </Link>
                ))}
              </p>
            )}
            {item.origin && (
              <p className="origin">
                {t('common.origin')}
                <Link
                  to={`/${routes[item.origin.entityType]}/${item.origin.id}`}
                >
                  {t(`nav.${item.origin.entityType}`)}
                  <ArrowRight />
                </Link>
              </p>
            )}
            {kind !== 'idea' && (
              <Field className="entry-heading">
                <FieldLabel htmlFor="entry-title">
                  {t(kind === 'skill' ? 'skill.name' : 'common.title')}
                </FieldLabel>
                <Input
                  id="entry-title"
                  className="title-input"
                  value={draft.title}
                  maxLength={kind === 'todo' ? 500 : undefined}
                  required={kind === 'todo'}
                  aria-invalid={kind === 'todo' && !draft.title.trim()}
                  onChange={(e) => update('title', e.target.value)}
                />
              </Field>
            )}
            <AiEditor
              kind={kind}
              id={item.id}
              draft={draft}
              setDraft={setDraft}
              onChange={bodyChange}
            />
          </div>
          <aside
            className="detail-inspector"
            aria-label={t('common.properties')}
          >
            <h2>{t('common.properties')}</h2>
            {kind === 'todo' && 'status' in item && (
              <Button
                variant="outline"
                onClick={() => run(() => appApi.toggleTodo(item.id))}
              >
                <Check data-icon="inline-start" />
                {t(item.status === 'done' ? 'todo.reopen' : 'todo.complete')}
              </Button>
            )}
            <DetailFields
              kind={kind}
              draft={draft}
              update={update}
              onUrlBlur={() => {
                if (kind === 'skill' && !draft.title.trim() && draft.url)
                  void appApi
                    .linkTitle(draft.url)
                    .then((title) => {
                      if (title)
                        setDraft((d) => ({ ...d, title: d.title || title }));
                    })
                    .catch(() => {});
              }}
            />
            <Field className="tags-field">
              <FieldLabel htmlFor="entry-tags">{t('common.tags')}</FieldLabel>
              <TagInput
                id="entry-tags"
                value={draft.tags}
                onChange={(tags) => update('tags', tags)}
              />
            </Field>
            {kind === 'skill' && (
              <SkillActions
                id={item.id}
                draft={draft}
                setDraft={setDraft}
                flush={flush}
              />
            )}
            {kind === 'todo' && 'parentId' in item && !item.parentId && (
              <Subtasks id={item.id} />
            )}
            {kind === 'idea' && (
              <div className="convert-actions">
                {(['todo', 'tip', 'prompt'] as const).map((target) => (
                  <Button
                    key={target}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run(async () => {
                        const ref = await appApi.convert(item.id, target);
                        void navigate(`/${routes[ref.entityType]}/${ref.id}`);
                      })
                    }
                  >
                    {t(
                      `idea.${target === 'todo' ? 'toTodo' : target === 'tip' ? 'toTip' : 'toPrompt'}`,
                    )}
                  </Button>
                ))}
              </div>
            )}
            {kind === 'prompt' && (
              <PromptActions
                id={item.id}
                body={draft.body}
                count={'useCount' in item ? item.useCount : 0}
                beforeUse={flush}
              />
            )}
            {kind === 'prompt' && (
              <PromptVersions
                id={item.id}
                draft={draft}
                before={flush}
                apply={(p) => {
                  const binding = useAiStore.getState().editor;
                  if (binding?.id === item.id)
                    binding
                      .handle()
                      ?.replaceRange(0, draft.body.length, p.body);
                  setDraft(fromEntry(p, 'prompt'));
                }}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
