import type { SaveStatus } from '@/hooks/autosave-controller';
import { Check, LoaderCircle, CircleAlert } from 'lucide-react';
import { t } from '@/i18n';
export function SaveIndicator({
  status,
  retry,
}: {
  status: SaveStatus;
  retry: () => void;
}) {
  return (
    <button
      type="button"
      className={`save-status ${status}`}
      disabled={status !== 'error'}
      onClick={retry}
      aria-live="polite"
    >
      {status === 'saving' ? (
        <LoaderCircle className="spin" />
      ) : status === 'error' ? (
        <CircleAlert />
      ) : (
        <Check />
      )}
      {t(`common.${status}`)}
    </button>
  );
}
