import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { requestAction, useAiStore } from '../ai/store';
import { toast } from 'sonner';
export function DailySummary() {
  const busy = useAiStore((s) => s.status === 'streaming');
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => {
        void requestAction('daily_summary', []).catch((e: Error) =>
          toast.error(e.message),
        );
      }}
    >
      {t('v02.summary')}
    </Button>
  );
}
