import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import { useAiStore, sendChat } from './store';
import type { SearchHit } from '@/types/bindings/SearchHit';
export function ChatComposer() {
  const question = useAiStore((s) => s.composerText);
  const setQuestion = (value: string | ((previous: string) => string)) =>
    useAiStore.getState().patch({
      composerText:
        typeof value === 'function'
          ? value(useAiStore.getState().composerText)
          : value,
    });
  const [refs, setRefs] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState('');
  const busy = useAiStore((s) => s.status === 'streaming');
  const token = /@([^\s@]*)$/.exec(question)?.[1];
  useEffect(() => {
    const timer = setTimeout(() => setQuery(token ?? ''), 150);
    return () => clearTimeout(timer);
  }, [token]);
  const matches = useQuery({
    queryKey: ['search', 'reference', query],
    queryFn: () => appApi.search(query),
    enabled: token !== undefined && !!query,
  });
  return (
    <form
      className="ai-chat-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (question.trim() && !busy) {
          sendChat(
            question,
            refs.map((r) => ({ entityType: r.entityType, id: r.id })),
          );
          setQuestion('');
          setRefs([]);
        }
      }}
    >
      {!!refs.length && (
        <div className="reference-chips">
          {refs.map((r) => (
            <span key={`${r.entityType}-${r.id}`}>
              {r.title}
              <button
                type="button"
                aria-label={t('v02.removeRef', { title: r.title })}
                onClick={() =>
                  setRefs((v) =>
                    v.filter(
                      (i) => i.id !== r.id || i.entityType !== r.entityType,
                    ),
                  )
                }
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        aria-label={t('ai.question')}
        placeholder={t('v02.referenceHint')}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
      />
      {token !== undefined && (
        <div className="reference-picker" aria-label={t('v02.reference')}>
          {matches.error ? (
            <p role="alert">{matches.error.message}</p>
          ) : !query ? (
            <p className="muted">{t('v02.referenceHint')}</p>
          ) : (
            matches.data?.map((r) => (
              <button
                type="button"
                key={`${r.entityType}-${r.id}`}
                disabled={refs.length >= 20}
                onClick={() => {
                  setRefs((v) =>
                    v.some(
                      (i) => i.id === r.id && i.entityType === r.entityType,
                    )
                      ? v
                      : [...v, r],
                  );
                  setQuestion((v) => v.replace(/@[^\s@]*$/, ''));
                }}
              >
                {r.entityType === 'idea'
                  ? t('capture.idea')
                  : t(`nav.${r.entityType}`)}{' '}
                · {r.title}
              </button>
            ))
          )}
        </div>
      )}
      <Button type="submit" disabled={!question.trim() || busy}>
        {t('ai.send')}
      </Button>
    </form>
  );
}
