import { useState } from 'react';
import { desktop } from '@/lib/api/app';
import { v02Api } from '@/lib/api/v02';
import type { SkillCandidate } from '@/types/bindings/SkillCandidate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { useAction } from '../content/hooks';
export function SkillBatchImport() {
  const [rows, setRows] = useState<SkillCandidate[] | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const action = useAction(async (run: () => Promise<unknown>) => run());
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            const path = await desktop.chooseFolder();
            if (typeof path === 'string') {
              const found = await v02Api.scan(path);
              setRows(found);
              setPaths(
                found.filter((r) => !r.exists && !r.error).map((r) => r.path),
              );
            }
          })
        }
      >
        {t('v02.scan')}
      </Button>
      <Dialog
        open={rows !== null}
        onOpenChange={(open) => {
          if (!open) setRows(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>{t('v02.scan')}</DialogTitle>
          </DialogHeader>
          <p className="muted">{t('v02.scanHint')}</p>
          {!rows?.length ? (
            <p>{t('v02.scanEmpty')}</p>
          ) : (
            <ul className="skill-import-preview">
              {rows.map((row) => (
                <li key={row.path}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={row.exists || !!row.error}
                      checked={paths.includes(row.path)}
                      onChange={(e) =>
                        setPaths((p) =>
                          e.target.checked
                            ? [...p, row.path]
                            : p.filter((v) => v !== row.path),
                        )
                      }
                    />
                    <strong>{row.name}</strong>
                    {row.exists && <span>{t('v02.existing')}</span>}
                    {row.error && (
                      <span role="alert">{t('v02.invalidFile')}</span>
                    )}
                  </label>
                  <p>{row.description}</p>
                  <small className="muted">{row.path}</small>
                </li>
              ))}
            </ul>
          )}
          <Button
            disabled={!paths.length || action.isPending}
            onClick={() =>
              action.mutate(async () => {
                const report = await v02Api.importSkills(paths);
                setRows(null);
                toast.success(t('v02.batchDone', report));
              })
            }
          >
            {t('v02.batchImport')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
