import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { variables } from '@/lib/template';
import { t } from '@/i18n';
import { useAction } from '../content/hooks';
import { UsePromptDialog } from './UsePromptDialog';
export function PromptActions({
  id,
  body,
  count,
  beforeUse,
}: {
  id: string;
  body: string;
  count: number;
  beforeUse: () => Promise<unknown>;
}) {
  const [using, setUsing] = useState(false);
  const names = variables(body);
  const action = useAction(async () => {
    await beforeUse();
    setUsing(true);
  });
  return (
    <>
      <div className="prompt-actions">
        <div className="variables">
          <span>{t('prompt.variables')}</span>
          {names.length ? (
            names.map((v) => (
              <Badge key={v} variant="secondary">
                {v}
              </Badge>
            ))
          ) : (
            <span className="muted">{t('prompt.none')}</span>
          )}
        </div>
        <div className="toolbar-actions">
          <span className="muted">{t('prompt.usage', { count })}</span>
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(undefined)}
          >
            {t('prompt.use')}
          </Button>
        </div>
      </div>
      {using && (
        <UsePromptDialog id={id} body={body} onClose={() => setUsing(false)} />
      )}
    </>
  );
}
