import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NotebookPen, Plus, RefreshCw } from 'lucide-react';
import { t } from '@/i18n';
export function EmptyState({
  title = t('common.empty'),
  description = t('common.emptyHint'),
  onCreate,
}: {
  title?: string;
  description?: string;
  onCreate?: () => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <NotebookPen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onCreate && (
        <EmptyContent>
          <Button onClick={onCreate}>
            <Plus data-icon="inline-start" />
            {t('common.new')}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
export function Loading() {
  return (
    <div className="loading" aria-label={t('app.loading')}>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="failure" role="alert">
      <p>{error instanceof Error ? error.message : t('common.failure')}</p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw data-icon="inline-start" />
        {t('common.retry')}
      </Button>
    </div>
  );
}
