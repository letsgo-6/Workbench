import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { dataApi } from '@/lib/api/data';
import { desktop } from '@/lib/api/app';
import { flushAll } from '@/hooks/useAutosave';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import { toast } from 'sonner';
export function DataSettings() {
  const [path, setPath] = useState<string | null>(null);
  const [mode, setMode] = useState<'merge' | 'overwrite'>('merge');
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [directory, setDirectory] = useState<string | null>(null);
  const action = useAction((fn: () => Promise<unknown>) => fn());
  const filter = [{ name: t('data.file'), extensions: ['json'] }];
  return (
    <section>
      <h2>{t('data.title')}</h2>
      <p className="muted">{t('data.mergeHint')}</p>
      <div className="toolbar-actions">
        <Button
          variant="outline"
          onClick={() =>
            action.mutate(async () => {
              const path = await save({
                defaultPath: 'workbench-backup.json',
                filters: filter,
              });
              if (path) {
                await flushAll();
                await dataApi.export(path);
                toast.success(t('data.exported'));
              }
            })
          }
        >
          {t('data.export')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            action.mutate(async () => {
              const value = await open({ multiple: false, filters: filter });
              if (typeof value === 'string') {
                setPath(value);
                setPhrase('');
                setConfirm(true);
              }
            })
          }
        >
          {t('data.import')}
        </Button>
        <Button variant="ghost" onClick={() => action.mutate(dataApi.open)}>
          {t('data.open')}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            action.mutate(async () => {
              const value = await desktop.chooseFolder();
              if (typeof value === 'string') setDirectory(value);
            })
          }
        >
          {t('data.change')}
        </Button>
      </div>
      {confirm && (
        <div className="import-controls">
          <p>{t('data.path', { path: path ?? '' })}</p>
          <select
            aria-label={t('data.mode')}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value === 'overwrite' ? 'overwrite' : 'merge');
              setPhrase('');
            }}
          >
            <option value="merge">{t('data.merge')}</option>
            <option value="overwrite">{t('data.overwrite')}</option>
          </select>
          <p>
            {t(mode === 'overwrite' ? 'data.overwriteHint' : 'data.mergeHint')}
          </p>
          {mode === 'overwrite' && (
            <Input
              aria-label={t('data.confirmation')}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
            />
          )}
          <Button
            disabled={
              action.isPending ||
              (mode === 'overwrite' && phrase !== t('data.phrase'))
            }
            onClick={() =>
              action.mutate(async () => {
                if (!path) return;
                await flushAll();
                const report = await dataApi.import(path, mode);
                toast.success(t('data.done', { ...report }));
                setConfirm(false);
              })
            }
          >
            {t('data.confirm')}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={directory !== null}
        onOpenChange={(open) => {
          if (!open) setDirectory(null);
        }}
        title={t('data.changeConfirm')}
        description={directory ?? ''}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (directory) {
              await flushAll();
              await dataApi.change(directory);
            }
          })
        }
      />
    </section>
  );
}
