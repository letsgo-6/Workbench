import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import type { EntityRef } from '@/types/bindings/EntityRef';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState, Failure, Loading } from '@/components/common/Feedback';
import { useAction } from '../content/hooks';
export function TrashPage() {
  const query = useQuery({ queryKey: ['trash'], queryFn: appApi.trash });
  const [target, setTarget] = useState<EntityRef | 'all' | null>(null);
  const action = useAction((ref: EntityRef) => appApi.restore(ref));
  const purge = useAction(async () => {
    if (target === 'all') await appApi.emptyTrash();
    else if (target) await appApi.purge(target);
  });
  return (
    <div className="page-scroll utility-page">
      <header className="utility-header">
        <div>
          <h1>{t('nav.trash')}</h1>
          <p>{t('trash.hint')}</p>
        </div>
        <Button
          variant="outline"
          disabled={!query.data?.length}
          onClick={() => setTarget('all')}
        >
          <Trash2 data-icon="inline-start" />
          {t('trash.emptyAll')}
        </Button>
      </header>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState title={t('trash.empty')} description={t('trash.hint')} />
      ) : (
        <div className="trash-list">
          {query.data.map((item) => (
            <div key={item.ref.id} className="trash-row">
              <div>
                <span className="muted">
                  {t(`nav.${item.ref.entityType}`)} ·{' '}
                  {new Date(item.deletedAt).toLocaleDateString('zh-CN')}
                </span>
                <strong>{item.title || t('common.untitled')}</strong>
              </div>
              <Button
                variant="ghost"
                disabled={action.isPending}
                onClick={() => action.mutate(item.ref)}
              >
                <RotateCcw data-icon="inline-start" />
                {t('common.restore')}
              </Button>
              <Button variant="ghost" onClick={() => setTarget(item.ref)}>
                {t('common.purge')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t(
          target === 'all' ? 'trash.emptyConfirm' : 'trash.purgeConfirm',
        )}
        onConfirm={() => purge.mutateAsync(undefined)}
      />
    </div>
  );
}
