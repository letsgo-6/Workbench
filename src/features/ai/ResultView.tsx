import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/editor/MarkdownPreview';
import { aiApi } from '@/lib/api/ai';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { useAiStore, type Job } from './store';
import { DiffView } from './DiffView';
import { writeResult, saveResult, copyResult } from './apply';
import { BreakdownPreview } from '../todos/BreakdownPreview';
export function ResultView({
  job,
  text,
  status,
  regenerate,
}: {
  job: Extract<Job, { mode: 'action' }>;
  text: string;
  status: string;
  regenerate: () => void;
}) {
  const parsed = useQuery({
    queryKey: ['ai-parse', job.id, text],
    queryFn: () => aiApi.parse(job.action, text),
    enabled: status === 'done',
  });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [title, setTitle] = useState(true);
  const [busy, setBusy] = useState(false);
  const result = parsed.data;
  const ready = status === 'done' && result?.valid;
  const binding = useAiStore((s) => s.editor);
  const matching =
    binding &&
    binding.id === job.target?.id &&
    binding.entityType === job.target?.entityType;
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    void fn()
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  function apply() {
    if (!matching || !result || !job.target) return;
    const current = binding.draft();
    if (
      current.body.slice(job.target.from, job.target.to) !== job.target.original
    ) {
      toast.error(t('ai.stale'));
      return;
    }
    if (title && result.title && binding.entityType === 'idea') {
      const editor = binding.handle();
      if (!editor) {
        toast.error(t('ai.noTarget'));
        return;
      }
      editor.replaceRange(0, 0, `# ${result.title}\n\n`);
      editor.focus();
    }
    binding.apply({
      tags: [
        ...new Set([
          ...current.tags,
          ...result.tags.filter((tag) => !excluded.includes(tag)),
        ]),
      ],
      ...(title && result.title && binding.entityType !== 'idea'
        ? { title: result.title }
        : {}),
      ...(title && result.description
        ? { description: result.description }
        : {}),
    });
  }
  return (
    <section className="ai-result" aria-label={t('ai.result')}>
      <p className="muted">{t('ai.manual')}</p>
      {!result ? (
        <pre className="stream-output" aria-live="polite">
          {text}
        </pre>
      ) : !result.valid ? (
        <>
          <p role="alert">{t('ai.invalid')}</p>
          <pre className="stream-output">{text}</pre>
        </>
      ) : result.kind === 'todos' ? (
        <BreakdownPreview initial={result.todos} />
      ) : result.kind === 'rewrite' ? (
        <>
          <DiffView
            before={job.target?.original ?? ''}
            after={result.text}
            lines={job.action === 'optimize_prompt'}
          />
          {result.changes && (
            <section>
              <h4>{t('ai.changes')}</h4>
              <MarkdownPreview value={result.changes} />
            </section>
          )}
        </>
      ) : result.kind === 'json' ? (
        <fieldset className="structured-result">
          <legend>{t('ai.fields')}</legend>
          {(result.title || result.description) && (
            <label>
              <input
                type="checkbox"
                checked={title}
                onChange={(e) => setTitle(e.target.checked)}
              />
              {result.title ? t('ai.titleField') : t('ai.descriptionField')}
              <p>{result.title ?? result.description}</p>
            </label>
          )}
          {result.tags.map((tag) => (
            <label key={tag}>
              <input
                type="checkbox"
                checked={!excluded.includes(tag)}
                onChange={() =>
                  setExcluded((v) =>
                    v.includes(tag) ? v.filter((t) => t !== tag) : [...v, tag],
                  )
                }
              />
              {tag}
            </label>
          ))}
        </fieldset>
      ) : (
        <MarkdownPreview value={result.text} />
      )}
      <div className="ai-result-actions">
        {ready && result?.kind === 'rewrite' && job.target && (
          <Button
            disabled={busy}
            onClick={() =>
              run(() => writeResult(job.target!, result.text, false))
            }
          >
            {t('ai.replace')}
          </Button>
        )}
        {ready &&
          ['rewrite', 'markdown'].includes(result?.kind ?? '') &&
          job.target && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                run(() => writeResult(job.target!, result!.text, true))
              }
            >
              {t('ai.insert')}
            </Button>
          )}
        {ready && result?.kind === 'json' && (
          <>
            <Button disabled={busy || !matching} onClick={apply}>
              {t('ai.apply')}
            </Button>
            {!matching && <p>{t('ai.noTarget')}</p>}
          </>
        )}
        {ready && result?.kind === 'tip_card' ? (
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                saveResult('tip', result.text, result.title ?? undefined),
              )
            }
          >
            {t('ai.saveTip')}
          </Button>
        ) : (
          ready &&
          !['json', 'todos'].includes(result?.kind ?? '') && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                run(() =>
                  saveResult(
                    result?.kind === 'rewrite'
                      ? (job.target?.entityType ?? 'idea')
                      : 'idea',
                    result!.text,
                  ),
                )
              }
            >
              {t(result?.kind === 'rewrite' ? 'ai.saveNew' : 'ai.save')}
            </Button>
          )
        )}
        <Button
          disabled={!text || busy}
          variant="ghost"
          onClick={() =>
            run(() => copyResult(result?.valid ? result.text : text))
          }
        >
          {t('ai.copy')}
        </Button>
        <Button
          disabled={status === 'streaming' || busy}
          variant="ghost"
          onClick={regenerate}
        >
          {t('ai.regenerate')}
        </Button>
      </div>
    </section>
  );
}
