import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Failure, Loading } from '@/components/common/Feedback';
import { providerApi } from '@/lib/api/providers';
import { t } from '@/i18n';
import { useAction } from '../content/hooks';
import { ProviderForm } from './ProviderForm';
export function ModelSettings() {
  const query = useQuery({ queryKey: ['provider'], queryFn: providerApi.list });
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const action = useAction((fn: () => Promise<unknown>) => fn());
  return (
    <section>
      <div className="section-heading">
        <h2>{t('model.title')}</h2>
        <Button onClick={() => setEditing('new')}>{t('model.add')}</Button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="provider-list">
            {!query.data.length && (
              <p className="muted">{t('model.noModels')}</p>
            )}
            {query.data.map((p) => (
              <article key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  {p.isDefault && <small>{t('model.default')}</small>}
                  <p className="muted">
                    {p.model} · {p.baseUrl}
                  </p>
                  <p>{p.hasKey ? p.keyHint : t('errors.AI_NO_KEY')}</p>
                </div>
                <div className="toolbar-actions">
                  <Button variant="outline" onClick={() => setEditing(p.id)}>
                    {t('model.edit')}
                  </Button>
                  {!p.isDefault && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        action.mutate(() => providerApi.setDefault(p.id))
                      }
                    >
                      {t('model.makeDefault')}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDeleting(p.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {editing && (
            <ProviderForm
              key={editing}
              provider={query.data.find((p) => p.id === editing)}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('model.remove')}
        description={t('model.keyEmpty')}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (deleting) await providerApi.delete(deleting);
            setDeleting(null);
          })
        }
      />
    </section>
  );
}
