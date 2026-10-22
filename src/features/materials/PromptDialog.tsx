import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { desktop } from '@/lib/api/app';
import { variables } from '@/lib/template';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { UsePromptDialog } from '../prompts/UsePromptDialog';
import { useAiStore } from '../ai/store';
import type { Material } from '@/types/bindings/Material';
export function stageMaterialPrompt(text: string) {
  useAiStore.getState().patch({ open: true, composerText: text });
  toast.success(t('material.promptStaged'));
}
export function PromptDialog({
  item,
  onClose,
  onEdit,
}: {
  item: Material;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [filling, setFilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    if (variables(item.prompt).length) {
      setFilling(true);
      return;
    }
    setBusy(true);
    try {
      await desktop.copy(item.prompt);
      toast.success(t('common.copied'));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.failure'));
    } finally {
      setBusy(false);
    }
  };
  if (filling)
    return (
      <UsePromptDialog
        body={item.prompt}
        onClose={onClose}
        onSend={stageMaterialPrompt}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="material-prompt-dialog">
        <DialogHeader>
          <DialogTitle>
            {t('material.promptTitle', {
              title: item.title || t('common.untitled'),
            })}
          </DialogTitle>
          <DialogDescription>{t('material.promptHint')}</DialogDescription>
        </DialogHeader>
        <pre className="material-prompt-text">
          {item.prompt
            .split(/(\{\{\s*[^{}\n]+?\s*\}\})/g)
            .map((part, index) =>
              part.startsWith('{{') ? <mark key={index}>{part}</mark> : part,
            )}
        </pre>
        <DialogFooter>
          <Button variant="ghost" onClick={onEdit}>
            {t('common.edit')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (variables(item.prompt).length) {
                setFilling(true);
                return;
              }
              stageMaterialPrompt(item.prompt);
              onClose();
            }}
          >
            {t('material.sendPrompt')}
          </Button>
          <Button autoFocus disabled={busy} onClick={() => void copy()}>
            {t('material.copyPrompt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
