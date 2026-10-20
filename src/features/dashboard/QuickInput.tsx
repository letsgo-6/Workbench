import { useState } from 'react';
import { ArrowUp, Lightbulb, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { contentApi } from '@/lib/api/content';
import { toInput, emptyDraft } from '../content/draft';
import { useAction } from '../content/hooks';
import { localDate } from '@/lib/date';
import { t } from '@/i18n';
export function QuickInput() {
  const [kind, setKind] = useState<'idea' | 'todo'>('idea');
  const [value, setValue] = useState('');
  const create = useAction(async () => {
    if (!value.trim()) return;
    const draft = {
      ...emptyDraft(kind),
      title: value.trim(),
      body: kind === 'idea' ? value : '',
      dueDate: kind === 'todo' ? localDate() : '',
    };
    await contentApi(kind).create(toInput(kind, draft));
    setValue('');
  });
  return (
    <section className="quick-input">
      <div className="capture-field">
        <textarea
          aria-label={t('dashboard.quickLabel')}
          value={value}
          disabled={create.isPending}
          rows={2}
          placeholder={t(
            kind === 'idea' ? 'dashboard.quick' : 'dashboard.quickTodo',
          )}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Tab') {
              e.preventDefault();
              setKind((k) => (k === 'idea' ? 'todo' : 'idea'));
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              create.mutate(undefined);
            }
          }}
        />
        <div className="capture-bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKind(kind === 'idea' ? 'todo' : 'idea')}
          >
            {kind === 'idea' ? (
              <Lightbulb data-icon="inline-start" />
            ) : (
              <CircleCheck data-icon="inline-start" />
            )}
            {t(`nav.${kind}`)}
          </Button>
          <span>{t('dashboard.quickHint')}</span>
          <Button
            size="icon-sm"
            aria-label={t('dashboard.add')}
            disabled={!value.trim() || create.isPending}
            onClick={() => create.mutate(undefined)}
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </section>
  );
}
