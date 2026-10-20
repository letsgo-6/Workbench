import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from '@/components/ui/dialog';
import { ExternalLink, Download, FolderDown } from 'lucide-react';
import { appApi, desktop } from '@/lib/api/app';
import { v02Api } from '@/lib/api/v02';
import { DiffView } from '../ai/DiffView';
import { writeResult } from '../ai/apply';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { useAction } from '../content/hooks';
import type { Draft } from '../content/draft';
export function SkillActions({
  id,
  draft,
  setDraft,
  flush,
}: {
  id: string;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  flush: () => Promise<void>;
}) {
  const [remote, setRemote] = useState<{
    before: string;
    after: string;
  } | null>(null);
  const action = useAction(async (run: () => Promise<unknown>) => {
    await flush();
    return run();
  });
  const run = (fn: () => Promise<unknown>) => action.mutate(fn);
  async function exportSkill(folder: boolean) {
    const path = folder
      ? await desktop.chooseFolder()
      : await desktop.saveMd(draft.title);
    if (typeof path === 'string') {
      if (folder) await appApi.exportFolder(id, path);
      else await appApi.exportSkill(id, path);
      toast.success(t('common.exportDone'));
    }
  }
  return (
    <div className="skill-actions">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          run(async () => {
            const parsed = await appApi.parse(draft.body);
            setDraft((d) => ({
              ...d,
              title: d.title || parsed.name || '',
              description: d.description || parsed.description || '',
            }));
          })
        }
      >
        {t('skill.parse')}
      </Button>
      {draft.url && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => run(() => desktop.openUrl(draft.url))}
          >
            <ExternalLink data-icon="inline-start" />
            {t('skill.open')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={action.isPending}
            onClick={() =>
              run(async () => {
                const before = draft.body;
                const after = await v02Api.fetchSkill(draft.url);
                if (after === before) toast(t('v02.sameSource'));
                else setRemote({ before, after });
              })
            }
          >
            {t('v02.fetch')}
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => run(() => exportSkill(false))}
      >
        <Download data-icon="inline-start" />
        {t('skill.export')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => run(() => exportSkill(true))}
      >
        <FolderDown data-icon="inline-start" />
        {t('skill.folder')}
      </Button>
      <Dialog
        open={!!remote}
        onOpenChange={(open) => {
          if (!open) setRemote(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>{t('v02.fetch')}</DialogTitle>
          </DialogHeader>
          <p className="muted">{t('v02.fetchHint')}</p>
          {remote && (
            <DiffView before={remote.before} after={remote.after} lines />
          )}
          <Button
            disabled={action.isPending || !remote}
            onClick={() =>
              run(async () => {
                if (!remote) return;
                if (draft.body !== remote.before)
                  throw new Error(t('v02.sourceChanged'));
                await writeResult(
                  {
                    entityType: 'skill',
                    id,
                    from: 0,
                    to: remote.before.length,
                    original: remote.before,
                  },
                  remote.after,
                  false,
                );
                setRemote(null);
              })
            }
          >
            {t('v02.fetchConfirm')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
