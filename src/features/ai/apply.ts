import { useAiStore, type Target } from './store';
import { contentApi, bodyOf } from '@/lib/api/content';
import { fromEntry, toInput, emptyDraft } from '../content/draft';
import { flushAll } from '@/hooks/useAutosave';
import { desktop } from '@/lib/api/app';
import { t } from '@/i18n';
import { toast } from 'sonner';
import type { EntityType } from '@/types/bindings/EntityType';
export async function writeResult(
  target: Target,
  text: string,
  insert: boolean,
) {
  const binding = useAiStore.getState().editor;
  if (binding?.id === target.id && binding.entityType === target.entityType) {
    const editor = binding.handle();
    if (
      !editor ||
      binding.draft().body.slice(target.from, target.to) !== target.original
    )
      throw new Error(t('ai.stale'));
    editor.replaceRange(
      insert ? target.to : target.from,
      target.to,
      insert ? `\n\n${text}` : text,
    );
    editor.focus();
    return;
  }
  await flushAll();
  const api = contentApi(target.entityType);
  const item = await api.get(target.id);
  const before = bodyOf(item);
  if (before.slice(target.from, target.to) !== target.original)
    throw new Error(t('ai.stale'));
  const draft = fromEntry(item, target.entityType);
  draft.body =
    before.slice(0, insert ? target.to : target.from) +
    (insert ? `\n\n${text}` : text) +
    before.slice(target.to);
  await api.update(target.id, toInput(target.entityType, draft));
  toast(t('common.saved'), {
    action: {
      label: t('common.undo'),
      onClick: () => {
        void (async () => {
          const current = await api.get(target.id);
          if (bodyOf(current) !== draft.body) throw new Error(t('ai.stale'));
          const reverted = fromEntry(current, target.entityType);
          reverted.body = before;
          await api.update(target.id, toInput(target.entityType, reverted));
        })().catch((e: Error) => toast.error(e.message));
      },
    },
  });
}
export async function saveResult(
  kind: EntityType,
  text: string,
  title?: string,
) {
  const draft = {
    ...emptyDraft(kind),
    body: text,
    title:
      title ??
      text
        .split('\n')[0]
        ?.replace(/^#+\s*/, '')
        .slice(0, 80) ??
      '',
  };
  await contentApi(kind).create(toInput(kind, draft));
  toast.success(t('ai.saved'));
}
export async function copyResult(text: string) {
  await desktop.copy(text);
  toast.success(t('common.copied'));
}
