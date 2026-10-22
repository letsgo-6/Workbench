import { Button } from '@/components/ui/button';
import { AppError } from '@/lib/ipc';
import { t } from '@/i18n';
export function CaptureFallback({
  error,
  retry,
  manual,
  disabled,
}: {
  error: Error;
  retry: () => void;
  manual: (kind: 'idea' | 'todo') => void;
  disabled: boolean;
}) {
  const settings =
    error instanceof AppError &&
    ['AI_NO_PROVIDER', 'AI_NO_KEY', 'AI_AUTH', 'AI_ENDPOINT'].includes(
      error.code,
    );
  return (
    <div className="capture-fallback" role="alert">
      <p>{t('capture.failed', { reason: error.message })}</p>
      <div className="capture-actions">
        <Button variant="outline" disabled={disabled} onClick={retry}>
          {t('capture.retry')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => manual('idea')}
        >
          {t('capture.asIdea')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => manual('todo')}
        >
          {t('capture.asTodo')}
        </Button>
        {settings && <a href="#/settings/models">{t('capture.settings')}</a>}
      </div>
    </div>
  );
}
