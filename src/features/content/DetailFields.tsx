import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import type { Draft } from './draft';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { appApi } from '@/lib/api/app';
import { useQuery } from '@tanstack/react-query';
import { presetTools } from '@/lib/tools';
export function DetailFields({
  kind,
  draft: d,
  update,
  onUrlBlur,
}: {
  kind: EntityType;
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onUrlBlur: () => void;
}) {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  const categories = useQuery({
    queryKey: ['prompt', 'categories'],
    queryFn: appApi.categories,
    enabled: kind === 'prompt',
  });
  return (
    <FieldGroup className="detail-fields">
      {kind === 'idea' && (
        <Field>
          <FieldLabel htmlFor="entry-date">{t('common.date')}</FieldLabel>
          <Input
            id="entry-date"
            type="date"
            value={d.date}
            onChange={(e) => update('date', e.target.value)}
          />
        </Field>
      )}
      {kind === 'todo' && (
        <div className="field-row">
          <Field>
            <FieldLabel htmlFor="entry-due">{t('todo.due')}</FieldLabel>
            <Input
              id="entry-due"
              type="date"
              value={d.dueDate}
              onChange={(e) => update('dueDate', e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="entry-priority">
              {t('todo.priority')}
            </FieldLabel>
            <select
              id="entry-priority"
              value={d.priority}
              onChange={(e) => update('priority', Number(e.target.value))}
            >
              <option value={1}>{t('todo.high')}</option>
              <option value={2}>{t('todo.medium')}</option>
              <option value={3}>{t('todo.low')}</option>
            </select>
          </Field>
        </div>
      )}
      {kind === 'todo' && (
        <Field>
          <FieldLabel htmlFor="entry-remind">{t('v02.remindAt')}</FieldLabel>
          <Input
            id="entry-remind"
            type="datetime-local"
            value={d.remindAt}
            onChange={(e) => update('remindAt', e.target.value)}
          />
          <p className="muted">{t('v02.remindHint')}</p>
        </Field>
      )}
      {kind === 'tip' && (
        <Field>
          <FieldLabel>{t('tip.tools')}</FieldLabel>
          <div className="tool-options">
            {[
              ...new Set([
                ...presetTools,
                ...(settings.data?.tipsCustomTools ?? []),
                ...d.tools,
              ]),
            ].map((tool) => (
              <label key={tool}>
                <input
                  type="checkbox"
                  checked={d.tools.includes(tool)}
                  onChange={(e) =>
                    update(
                      'tools',
                      e.target.checked
                        ? [...d.tools, tool]
                        : d.tools.filter((s) => s !== tool),
                    )
                  }
                />
                {tool}
              </label>
            ))}
          </div>
          <Input
            aria-label={t('tip.customTool')}
            placeholder={t('tip.customTool')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const value = e.currentTarget.value.trim();
                if (value) {
                  update('tools', [...new Set([...d.tools, value])]);
                  void appApi.setSetting('tips.customTools', [
                    ...new Set([
                      ...(settings.data?.tipsCustomTools ?? []),
                      value,
                    ]),
                  ]);
                  e.currentTarget.value = '';
                }
              }
            }}
          />
        </Field>
      )}
      {(kind === 'skill' || kind === 'tip') && (
        <Field>
          <FieldLabel htmlFor="entry-url">
            {t(kind === 'skill' ? 'skill.url' : 'tip.source')}
          </FieldLabel>
          <Input
            id="entry-url"
            type="url"
            value={d.url}
            onChange={(e) => update('url', e.target.value)}
            onBlur={onUrlBlur}
          />
        </Field>
      )}
      {kind === 'skill' && (
        <>
          <Field>
            <FieldLabel htmlFor="entry-description">
              {t('skill.description')}
            </FieldLabel>
            <textarea
              id="entry-description"
              rows={2}
              value={d.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </Field>
          <div className="field-row">
            <Field>
              <FieldLabel htmlFor="entry-platforms">
                {t('skill.platforms')}
              </FieldLabel>
              <Input
                id="entry-platforms"
                value={d.platforms}
                onChange={(e) => update('platforms', e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-rating">
                {t('skill.rating')}
              </FieldLabel>
              <select
                id="entry-rating"
                value={d.rating}
                onChange={(e) => update('rating', e.target.value)}
              >
                <option value="">{t('skill.noRating')}</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="entry-note">{t('skill.note')}</FieldLabel>
            <textarea
              id="entry-note"
              value={d.note}
              onChange={(e) => update('note', e.target.value)}
            />
          </Field>
        </>
      )}
      {kind === 'prompt' && (
        <>
          <div className="field-row">
            <Field>
              <FieldLabel htmlFor="entry-category">
                {t('prompt.category')}
              </FieldLabel>
              <Input
                id="entry-category"
                list="categories"
                value={d.category}
                onChange={(e) => update('category', e.target.value)}
              />
              <datalist id="categories">
                {categories.data?.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-model">{t('prompt.model')}</FieldLabel>
              <Input
                id="entry-model"
                value={d.model}
                onChange={(e) => update('model', e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="entry-system">{t('prompt.system')}</FieldLabel>
            <textarea
              id="entry-system"
              rows={2}
              value={d.systemPrompt}
              onChange={(e) => update('systemPrompt', e.target.value)}
            />
          </Field>
        </>
      )}
    </FieldGroup>
  );
}
