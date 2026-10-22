import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { appApi } from '@/lib/api/app';
import type { CapturePreview as Preview } from '@/types/bindings/CapturePreview';
import type { CaptureRow } from './useSmartCapture';
import { CaptureCard } from './CaptureCard';
import { homeBus } from '../home/scene/bus';
import type { NodeId } from '../home/scene/types';
import { t } from '@/i18n';
export function CapturePreview({
  preview,
  rows,
  onChange,
  saving,
  confirmAutoSave,
  onSave,
  onOriginal,
  onCancel,
}: {
  preview: Preview;
  rows: CaptureRow[];
  onChange: (rows: CaptureRow[]) => void;
  saving: boolean;
  confirmAutoSave: boolean;
  onSave: () => void;
  onOriginal: () => void;
  onCancel: () => void;
}) {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  const valid =
    rows.length > 0 &&
    rows.every((r) => r.item.kind !== 'todo' || r.item.title.trim());
  const highlight = (target: EventTarget | null) => {
    const node =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-capture-node]')?.dataset
            .captureNode
        : null;
    homeBus.emit({ type: 'highlight', node: (node ?? null) as NodeId | null });
  };
  return (
    <div className="capture-preview" aria-busy={saving}>
      <h2>
        {t('capture.title', {
          count: rows.length,
          date: preview.today.slice(5),
          weekday: format(parseISO(preview.today), 'EEEE', { locale: zhCN }),
        })}
      </h2>
      {preview.partialCoverage && (
        <p className="capture-warning">{t('capture.partial')}</p>
      )}
      {preview.truncated && (
        <p className="capture-warning">{t('capture.truncated')}</p>
      )}
      {confirmAutoSave && (
        <p className="capture-warning">{t('capture.confirm')}</p>
      )}
      <fieldset
        onMouseOver={(e) => highlight(e.target)}
        onMouseLeave={() => highlight(null)}
        onFocus={(e) => highlight(e.target)}
        onBlur={() => highlight(null)}
        disabled={saving}
        className="capture-cards"
      >
        {rows.map((row) => (
          <CaptureCard
            key={row.id}
            item={row.item}
            today={preview.today}
            tools={settings.data?.tipsCustomTools ?? []}
            onChange={(item) =>
              onChange(rows.map((r) => (r.id === row.id ? { ...r, item } : r)))
            }
            onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}
          />
        ))}
      </fieldset>
      <div className="capture-actions">
        <Button disabled={!valid || saving} onClick={onSave}>
          {t(saving ? 'capture.saving' : 'capture.save')}
        </Button>
        <Button variant="outline" disabled={saving} onClick={onOriginal}>
          {t('capture.originalIdea')}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          {t('capture.cancel')}
        </Button>
      </div>
    </div>
  );
}
