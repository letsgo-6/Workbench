import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { aiApi } from '@/lib/api/ai';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Failure, Loading } from '@/components/common/Feedback';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
export function TemplateSettings() {
  const query = useQuery({
    queryKey: ['prompt', 'templates'],
    queryFn: aiApi.templates,
  });
  const [reset, setReset] = useState<string | null>(null);
  const action = useAction((fn: () => Promise<unknown>) => fn());
  return (
    <section>
      <h2>{t('desktop.templates')}</h2>
      <p className="muted">{t('desktop.templateHint')}</p>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data.map((p) => (
          <article className="template-row" key={p.id}>
            <div>
              <strong>{p.title}</strong>
              {p.hasNewDefault && (
                <span className="warning-text">{t('material.newDefault')}</span>
              )}
              <p className="muted">{p.body.slice(0, 100)}</p>
            </div>
            <Link to={`/prompts/${p.id}`}>{t('desktop.editTemplate')}</Link>
            <Button variant="ghost" onClick={() => setReset(p.templateKey)}>
              {t('desktop.reset')}
            </Button>
          </article>
        ))
      )}
      <ConfirmDialog
        open={reset !== null}
        onOpenChange={(open) => {
          if (!open) setReset(null);
        }}
        title={t('desktop.resetConfirm')}
        description={t('desktop.templateHint')}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (reset) await aiApi.reset(reset);
            setReset(null);
          })
        }
      />
    </section>
  );
}
