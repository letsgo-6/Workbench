import type { EntityRef } from '@/types/bindings/EntityRef';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { actionKeys, requestAction, type ActionKey } from './store';
export function AiMenu({
  refs,
  batch = false,
  onChoose,
}: {
  refs: EntityRef[];
  batch?: boolean;
  onChoose?: () => void;
}) {
  const keys: readonly ActionKey[] = batch
    ? ['summarize', 'categorize', 'merge_note']
    : actionKeys.filter(
        (k) =>
          (k !== 'skill_describe' &&
            k !== 'smart_capture' &&
            k !== 'optimize_prompt' &&
            k !== 'daily_summary' &&
            k !== 'breakdown_todos') ||
          (k === 'breakdown_todos' && refs[0]?.entityType === 'todo') ||
          (k === 'skill_describe' && refs[0]?.entityType === 'skill') ||
          (k === 'optimize_prompt' && refs[0]?.entityType === 'prompt'),
      );
  return (
    <select
      aria-label={t(batch ? 'ai.batch' : 'ai.menu')}
      value=""
      onChange={(e) => {
        const action = e.target.value as ActionKey;
        if (action) onChoose?.();
        if (action)
          void requestAction(action, refs).catch((error: Error) =>
            toast.error(error.message),
          );
      }}
    >
      <option value="">{t(batch ? 'ai.batch' : 'ai.menu')}</option>
      {keys.map((key) => (
        <option key={key} value={key}>
          {t(`ai.${key}`)}
        </option>
      ))}
    </select>
  );
}
