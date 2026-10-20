import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { variables, renderTemplate } from '@/lib/template';
import { appApi, desktop } from '@/lib/api/app';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { sendChat, useAiStore } from '../ai/store';
export function UsePromptDialog({
  id,
  body,
  onClose,
}: {
  id: string;
  body: string;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const aiBusy = useAiStore((s) => s.status === 'streaming');
  const names = variables(body);
  const result = renderTemplate(body, values);
  const copy = useAction(async () => {
    await desktop.copy(result);
    await appApi.usePrompt(id);
    toast.success(t('common.copied'));
    onClose();
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="prompt-dialog">
        <DialogHeader>
          <DialogTitle>{t('prompt.use')}</DialogTitle>
          <DialogDescription>{t('prompt.fill')}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {names.map((name, index) => (
            <Field key={name}>
              <FieldLabel htmlFor={`variable-${index}`}>{name}</FieldLabel>
              <Input
                id={`variable-${index}`}
                value={values[name] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [name]: e.target.value })
                }
                autoFocus={index === 0}
              />
            </Field>
          ))}
        </FieldGroup>
        {names.some((name) => !values[name]) && (
          <p className="muted">{t('prompt.missing')}</p>
        )}
        <label className="field-label" htmlFor="prompt-output">
          {t('prompt.result')}
        </label>
        <textarea
          id="prompt-output"
          readOnly
          value={result}
          className="prompt-output"
        />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={aiBusy}
            onClick={() => {
              sendChat(result);
              void appApi
                .usePrompt(id)
                .catch((e: Error) => toast.error(e.message));
              onClose();
            }}
          >
            {t('ai.sendPrompt')}
          </Button>
          <Button
            disabled={copy.isPending}
            onClick={() => copy.mutate(undefined)}
          >
            {t('prompt.copyUse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
