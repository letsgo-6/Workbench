import { create } from 'zustand';
import type { AiInput } from '@/types/bindings/AiInput';
import type { EntityRef } from '@/types/bindings/EntityRef';
import type { ChatMessage } from '@/types/bindings/ChatMessage';
import type { EditorHandle } from '@/components/editor/MarkdownEditor';
import type { Draft } from '../content/draft';
import { flushAll } from '@/hooks/useAutosave';
import { contentApi, bodyOf } from '@/lib/api/content';
import { t } from '@/i18n';
import { toast } from 'sonner';
export const actionKeys = [
  'polish',
  'shorten',
  'expand',
  'summarize',
  'categorize',
  'merge_note',
  'title_tags',
  'extract_tip',
  'optimize_prompt',
  'skill_describe',
  'breakdown_todos',
  'daily_summary',
] as const;
export type ActionKey = (typeof actionKeys)[number];
export interface Target extends EntityRef {
  from: number;
  to: number;
  original: string;
}
export interface EditorBinding extends EntityRef {
  handle: () => EditorHandle | null;
  draft: () => Draft;
  apply: (fields: Partial<Draft>) => void;
}
export type Job =
  | {
      id: string;
      providerId: string | null;
      mode: 'action';
      action: ActionKey;
      input: AiInput;
      target?: Target;
    }
  | {
      id: string;
      providerId: string | null;
      mode: 'chat';
      messages: ChatMessage[];
      conversationId: string | null;
      refs: EntityRef[];
    };
type Status = 'idle' | 'streaming' | 'done' | 'cancelled' | 'error';
interface AiState {
  open: boolean;
  providerId: string | null;
  job: Job | null;
  text: string;
  status: Status;
  error: Error | null;
  truncated: boolean;
  messages: ChatMessage[];
  conversationId: string | null;
  chatEpoch: number;
  editor: EditorBinding | null;
  patch: (partial: Partial<AiState>) => void;
}
export const useAiStore = create<AiState>((set) => ({
  open: false,
  providerId: null,
  job: null,
  text: '',
  status: 'idle',
  error: null,
  truncated: false,
  messages: [],
  conversationId: null,
  chatEpoch: 0,
  editor: null,
  patch: (partial) => set(partial),
}));
export function launch(
  job:
    | Omit<Extract<Job, { mode: 'action' }>, 'id' | 'providerId'>
    | Omit<Extract<Job, { mode: 'chat' }>, 'id' | 'providerId'>,
) {
  const s = useAiStore.getState();
  if (s.status === 'streaming') {
    toast(t('ai.busy'));
    return;
  }
  s.patch({
    open: true,
    job: { ...job, id: crypto.randomUUID(), providerId: s.providerId },
    status: 'streaming',
    text: '',
    error: null,
    truncated: false,
  });
}
export async function requestAction(
  action: ActionKey,
  refs: EntityRef[],
  selection?: Target,
) {
  await flushAll();
  let target = selection;
  if (!target && refs.length === 1 && refs[0]) {
    const ref = refs[0];
    const binding = useAiStore.getState().editor;
    const original =
      binding?.id === ref.id && binding.entityType === ref.entityType
        ? binding.draft().body
        : bodyOf(await contentApi(ref.entityType).get(ref.id));
    target = { ...ref, from: 0, to: original.length, original };
  }
  launch({
    mode: 'action',
    action,
    input:
      target &&
      (selection ||
        ['polish', 'shorten', 'expand', 'optimize_prompt'].includes(action))
        ? { kind: 'text', text: target.original }
        : { kind: 'entities', refs },
    target,
  });
}
export function sendChat(text: string, refs: EntityRef[] = []) {
  if (!text.trim()) {
    toast(t('ai.emptyInput'));
    return;
  }
  const s = useAiStore.getState();
  if (s.status === 'streaming') {
    toast(t('ai.busy'));
    return;
  }
  const messages = [...s.messages, { role: 'user', content: text }];
  const conversationId = s.conversationId;
  s.patch({ messages, conversationId });
  launch({
    mode: 'chat',
    messages: [{ role: 'user', content: text }],
    conversationId,
    refs,
  });
}
