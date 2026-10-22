import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { v02Api } from '@/lib/api/v02';
import { appApi, desktop } from '@/lib/api/app';
import { flushAll } from '@/hooks/useAutosave';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import { toast } from 'sonner';
export function BackupSettings() {
  const query = useQuery({ queryKey: ['backup'], queryFn: v02Api.backups });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  const [restore, setRestore] = useState<string | null>(null);
  const action = useAction(async (run: () => Promise<unknown>) => {
    await flushAll();
    return run();
  });
  return (
    <section>
      <h2>{t('v02.backups')}</h2>
      <p className="muted">{t('v02.backupHint')}</p>
      <p className="muted">{t('material.dailyBackupHint')}</p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.data?.backupAutoEnabled ?? true}
          onChange={(e) =>
            action.mutate(() =>
              appApi.setSetting('backup.autoEnabled', e.target.checked),
            )
          }
        />
        {t('v02.autoBackup')}
      </label>
      <div className="toolbar-actions">
        <Button
          disabled={action.isPending}
          variant="outline"
          onClick={() =>
            action.mutate(async () => {
              await v02Api.backup();
              await query.refetch();
              toast.success(t('v02.backupDone'));
            })
          }
        >
          {t('v02.backupNow')}
        </Button>
        <Button
          disabled={action.isPending}
          variant="outline"
          onClick={() =>
            action.mutate(async () => {
              const path = await desktop.chooseFolder();
              if (typeof path === 'string') {
                const count = await v02Api.exportMarkdown(path);
                toast.success(t('v02.markdownDone', { count }));
              }
            })
          }
        >
          {t('v02.markdownExport')}
        </Button>
      </div>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!query.data?.length ? (
        <p className="muted">{t('v02.noBackups')}</p>
      ) : (
        <ul className="backup-list">
          {query.data.map((b) => (
            <li key={b.name}>
              <span>
                {b.name}{' '}
                <small className="muted">
                  {(b.bytes / 1024).toFixed(0)} KB
                </small>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() => setRestore(b.name)}
              >
                {t('v02.restoreBackup')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!restore}
        onOpenChange={(open) => {
          if (!open) setRestore(null);
        }}
        title={`${t('v02.restoreBackup')} · ${restore ?? ''}`}
        description={t('v02.restoreBackupHint')}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (restore) await v02Api.restore(restore);
          })
        }
      />
    </section>
  );
}
