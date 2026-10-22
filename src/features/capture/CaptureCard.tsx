import { useEffect, useEffectEvent, useId } from 'react';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TagInput } from '@/components/common/TagInput';
import { appApi } from '@/lib/api/app';
import { kinds } from '@/lib/api/content';
import { presetTools } from '@/lib/tools';
import { localDate } from '@/lib/date';
import { variables } from '@/lib/template';
import type { CaptureItem } from '@/types/bindings/CaptureItem';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { convert } from './convert';
export function CaptureCard({
  item,
  today,
  tools,
  onChange,
  onRemove,
}: {
  item: CaptureItem;
  today: string;
  tools: string[];
  onChange: (item: CaptureItem) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const applyName = useEffectEvent((title: string, url: string) => {
    if (!item.title.trim() && item.url === url) onChange({ ...item, title });
  });
  useEffect(() => {
    if (
      (item.kind !== 'skill' && item.kind !== 'material') ||
      item.title.trim() ||
      !item.url
    )
      return;
    const url = item.url;
    let active = true;
    void appApi
      .linkTitle(item.url)
      .then((title) => {
        if (active && title) applyName(title, url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item.kind, item.title, item.url]);
  const update = <K extends keyof CaptureItem>(key: K, value: CaptureItem[K]) =>
    onChange({ ...item, [key]: value });
  const field = (
    key: 'title' | 'url' | 'description' | 'category',
    label: string,
  ) => (
    <label className="capture-label">
      <span>{label}</span>
      <Input
        value={item[key] ?? ''}
        type={key === 'url' ? 'url' : 'text'}
        required={key === 'title' && item.kind === 'todo'}
        aria-invalid={
          key === 'title' && item.kind === 'todo' && !item.title.trim()
        }
        maxLength={
          key === 'title' ? (item.kind === 'todo' ? 500 : 200) : undefined
        }
        onChange={(e) =>
          update(key, e.target.value || (key === 'url' ? null : ''))
        }
      />
    </label>
  );
  const date = item.kind === 'todo' ? item.dueDate : item.date;
  return (
    <article
      data-capture-node={item.kind}
      className={`capture-card ${item.confidence === 'low' ? 'capture-low' : ''}`}
    >
      <div className="capture-card-heading">
        <ToggleGroup
          type="single"
          value={item.kind}
          onValueChange={(kind) => {
            if (kinds.includes(kind as EntityType))
              onChange(convert(item, kind as EntityType, today));
          }}
        >
          {kinds.map((kind) => (
            <ToggleGroupItem key={kind} value={kind} size="sm">
              {kind === 'idea'
                ? t('capture.idea')
                : kind === 'material'
                  ? t('material.captureType')
                  : t(`nav.${kind}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          {t('capture.remove')}
        </Button>
      </div>
      {item.kind !== 'idea' &&
        field(
          'title',
          t(item.kind === 'skill' ? 'skill.name' : 'common.title'),
        )}
      {item.kind === 'material' && (
        <div className="capture-material-fields">
          <label className="capture-label">
            <span>{t('material.kind')}</span>
            <select
              value={item.materialKind ?? 'work'}
              onChange={(e) => update('materialKind', e.target.value)}
            >
              <option value="work">{t('material.work')}</option>
              <option value="component">{t('material.component')}</option>
            </select>
          </label>
          {field('url', t('common.url'))}
          <label className="capture-label">
            <span>{t('material.note')}</span>
            <textarea
              value={item.body}
              onChange={(e) => update('body', e.target.value)}
            />
          </label>
          {item.materialKind === 'component' && (
            <label className="capture-label">
              <span>{t('material.promptField')}</span>
              <textarea
                value={item.materialPrompt}
                onChange={(e) => update('materialPrompt', e.target.value)}
              />
            </label>
          )}
        </div>
      )}
      {item.kind === 'todo' && !item.title.trim() && (
        <p className="capture-warning">{t('capture.titleRequired')}</p>
      )}
      {(item.kind === 'idea' || item.kind === 'todo') && (
        <div className="capture-date-fields">
          <label className="capture-label">
            <span>{t(item.kind === 'todo' ? 'todo.due' : 'common.date')}</span>
            <Input
              type="date"
              value={date ?? ''}
              onChange={(e) =>
                update(
                  item.kind === 'todo' ? 'dueDate' : 'date',
                  e.target.value || null,
                )
              }
            />
            {date && (
              <span className="muted">
                {format(parseISO(date), 'EEEE', { locale: zhCN })}
              </span>
            )}
          </label>
          {item.kind === 'todo' && (
            <>
              <label className="capture-label">
                <span>{t('v02.remindAt')}</span>
                <Input
                  type="datetime-local"
                  value={
                    item.remindAt === null
                      ? ''
                      : `${localDate(new Date(item.remindAt))}T${new Date(item.remindAt).toTimeString().slice(0, 5)}`
                  }
                  onChange={(e) =>
                    update(
                      'remindAt',
                      e.target.value
                        ? new Date(e.target.value).getTime()
                        : null,
                    )
                  }
                />
              </label>
              <label className="capture-label">
                <span>{t('todo.priority')}</span>
                <select
                  value={item.priority}
                  onChange={(e) => update('priority', Number(e.target.value))}
                >
                  {([1, 2, 3] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(
                        p === 1
                          ? 'todo.high'
                          : p === 2
                            ? 'todo.medium'
                            : 'todo.low',
                      )}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}
      {item.dateText && (
        <p className={item.dateSource === 'ai' ? 'capture-warning' : 'muted'}>
          {t('capture.detected', { text: item.dateText })} ·{' '}
          {t(
            item.dateSource === 'rule'
              ? 'capture.rule'
              : item.dateSource === 'ai'
                ? 'capture.ai'
                : 'capture.unresolved',
          )}
        </p>
      )}
      {item.kind === 'tip' && (
        <fieldset className="capture-tools">
          <legend>{t('tip.tools')}</legend>
          {[...new Set([...presetTools, ...tools])].map((tool) => (
            <label key={tool}>
              <input
                type="checkbox"
                checked={item.tools.includes(tool)}
                onChange={(e) =>
                  update(
                    'tools',
                    e.target.checked
                      ? [...item.tools, tool]
                      : item.tools.filter((v) => v !== tool),
                  )
                }
              />
              {tool}
            </label>
          ))}
        </fieldset>
      )}
      {(item.kind === 'skill' || item.kind === 'tip') &&
        field('url', t(item.kind === 'skill' ? 'skill.url' : 'tip.source'))}
      {item.kind === 'skill' && (
        <>
          {field('description', t('skill.description'))}
          {item.skillContent !== null && (
            <p className="muted">{t('capture.skillContent')}</p>
          )}
        </>
      )}
      {item.kind === 'prompt' && field('category', t('prompt.category'))}
      {item.kind === 'todo' ? (
        <details>
          <summary>{t('capture.note')}</summary>
          <label className="capture-label">
            <span className="sr-only">{t('capture.note')}</span>
            <textarea
              rows={3}
              value={item.body}
              onChange={(e) => update('body', e.target.value)}
            />
          </label>
        </details>
      ) : (
        <label className="capture-label">
          <span>
            {t(item.kind === 'skill' ? 'capture.note' : 'common.content')}
          </span>
          <textarea
            rows={3}
            value={item.body}
            onChange={(e) => update('body', e.target.value)}
          />
        </label>
      )}
      {item.kind === 'prompt' && (
        <p className="muted">
          {t('prompt.variables')}：{variables(item.body).join('、')}
        </p>
      )}
      <label className="capture-label" htmlFor={`${id}-tags`}>
        {t('common.tags')}
      </label>
      <TagInput
        id={`${id}-tags`}
        value={item.tags}
        onChange={(tags) => update('tags', tags)}
      />
      {item.warnings.map((warning) => (
        <p key={warning} className="capture-warning">
          {t(`capture.warnings.${warning}`)}
        </p>
      ))}
      <details open={item.warnings.includes('sourceMismatch') || undefined}>
        <summary>{t('capture.source')}</summary>
        <pre className="capture-source">{item.source}</pre>
      </details>
    </article>
  );
}
