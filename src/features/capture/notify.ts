import { homeBus } from '../home/scene/bus';
import { toast } from 'sonner';
import { captureApi } from '@/lib/api/capture';
import { routes } from '@/lib/api/content';
import type { CaptureItem } from '@/types/bindings/CaptureItem';
import type { CaptureCommitResult } from '@/types/bindings/CaptureCommitResult';
import type { CaptureUndoInput } from '@/types/bindings/CaptureUndoInput';
import { t } from '@/i18n';
export async function undoCapture(input: CaptureUndoInput) {
  const nodes = input.refs.map((r) => r.entityType);
  homeBus.emit({ type: 'undoing', nodes });
  try {
    const result = await captureApi.undo(input);
    homeBus.emit({ type: result.removed ? 'undone' : 'released', nodes });
    toast(result.skipped ? t('capture.undoSkipped') : t('capture.undone'));
    return result;
  } catch (error) {
    homeBus.emit({ type: 'released', nodes });
    toast.error(error instanceof Error ? error.message : String(error));
    return null;
  }
}
export function notifySaved(items: CaptureItem[], result: CaptureCommitResult) {
  homeBus.emit({ type: 'committed', nodes: items.map((i) => i.kind) });
  const summary = [...new Set(items.map((i) => i.kind))]
    .map((kind) => {
      const matches = items.filter((i) => i.kind === kind);
      const due =
        kind === 'todo' && matches.length === 1 ? matches[0]?.dueDate : null;
      return `${kind === 'idea' ? t('capture.idea') : t(`nav.${kind}`)} ×${matches.length}${due ? t('capture.dueSummary', { date: due.slice(5) }) : ''}`;
    })
    .join('、');
  toast.success(t('capture.saved', { count: items.length, summary }), {
    duration: 8000,
    action: {
      label: t('capture.view'),
      onClick: () => {
        const first = result.refs[0];
        if (first)
          window.location.hash = `#/${routes[first.entityType]}${result.refs.length === 1 ? `/${first.id}` : ''}`;
      },
    },
    cancel: {
      label: t('capture.undo'),
      onClick: () => {
        void undoCapture({ refs: result.refs, createdAt: result.createdAt });
      },
    },
  });
}
