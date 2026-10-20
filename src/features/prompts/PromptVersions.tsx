import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DiffView } from '../ai/DiffView';
import { v02Api } from '@/lib/api/v02';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import type { Prompt } from '@/types/bindings/Prompt';
import type { Draft } from '../content/draft';
import { toast } from 'sonner';
export function PromptVersions({
  id,
  draft,
  before,
  apply,
}: {
  id: string;
  draft: Draft;
  before: () => Promise<void>;
  apply: (prompt: Prompt) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [confirm, setConfirm] = useState(false);
  const versions = useQuery({
    queryKey: ['prompt', 'versions', id],
    queryFn: () => v02Api.versions(id),
    enabled: open,
  });
  const action = useAction(async (run: () => Promise<unknown>) => {
    await before();
    return run();
  });
  const version =
    versions.data?.find((v) => v.id === selected) ?? versions.data?.[0];
  return (
    <div className="version-actions">
      <Button
        variant="outline"
        size="sm"
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            await v02Api.saveVersion(id);
            toast.success(t('v02.versionSaved'));
          })
        }
      >
        {t('v02.saveVersion')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void before()
            .then(() => setOpen(true))
            .catch((e: Error) => toast.error(e.message));
        }}
      >
        {t('v02.versions')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>{t('v02.versions')}</DialogTitle>
          </DialogHeader>
          {versions.error && <p role="alert">{versions.error.message}</p>}
          {!version ? (
            <p className="muted">{t('v02.noVersions')}</p>
          ) : (
            <>
              <select
                aria-label={t('v02.versions')}
                value={version.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {versions.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.createdAt).toLocaleString('zh-CN')} · {v.title}
                  </option>
                ))}
              </select>
              <DiffView before={draft.body} after={version.body} lines />
              {(draft.systemPrompt || version.systemPrompt) && (
                <DiffView
                  before={draft.systemPrompt}
                  after={version.systemPrompt ?? ''}
                  lines
                />
              )}
              <Button
                disabled={action.isPending}
                onClick={() => setConfirm(true)}
              >
                {t('v02.restoreVersion')}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('v02.restoreVersion')}
        description={t('v02.restoreVersionHint')}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (version) {
              const restored = await v02Api.restoreVersion(version.id);
              apply(restored);
              setOpen(false);
              toast.success(t('v02.versionRestored'));
            }
          })
        }
      />
    </div>
  );
}
