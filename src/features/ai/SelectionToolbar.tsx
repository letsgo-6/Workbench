import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { requestAction, type Target } from './store';
export function SelectionToolbar({
  target,
  top,
  left,
}: {
  target: Target;
  top: number;
  left: number;
}) {
  return (
    <div
      className="selection-ai-toolbar"
      style={{
        top: Math.max(8, top - 42),
        left: Math.min(left, window.innerWidth - 340),
      }}
      aria-label={t('ai.menu')}
      onMouseDown={(e) => e.preventDefault()}
    >
      {(['polish', 'shorten', 'expand', 'summarize'] as const).map((key) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          onClick={() =>
            void requestAction(key, [target], target).catch((e: Error) =>
              toast.error(e.message),
            )
          }
        >
          {t(`ai.${key}`)}
        </Button>
      ))}
    </div>
  );
}
