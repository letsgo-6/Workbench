import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { v02Api } from '@/lib/api/v02';
import { t } from '@/i18n';
import { useAiStore } from './store';
import { useAction } from '../content/hooks';
export function ConversationHistory() {
  const state = useAiStore();
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const rows = useQuery({
    queryKey: ['conversation'],
    queryFn: v02Api.conversations,
  });
  const action = useAction(async (run: () => Promise<unknown>) => run());
  const busy = state.status === 'streaming' || action.isPending;
  function clear() {
    state.patch({
      conversationId: null,
      chatEpoch: state.chatEpoch + 1,
      messages: [],
      job: null,
      text: '',
      error: null,
      status: 'idle',
    });
    setName(null);
  }
  return (
    <div className="conversation-history">
      <label htmlFor="conversation-select">{t('v02.history')}</label>
      <select
        id="conversation-select"
        disabled={busy}
        value={state.conversationId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) clear();
          else
            action.mutate(async () => {
              const saved = await v02Api.conversation(id);
              state.patch({
                conversationId: id,
                chatEpoch: state.chatEpoch + 1,
                providerId: saved.conversation.providerId,
                messages: saved.messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                })),
                job: null,
                text: '',
                error: null,
                status: 'idle',
              });
              setName(null);
            });
        }}
      >
        <option value="">{t('v02.newChat')}</option>
        {rows.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      {rows.error && <p role="alert">{rows.error.message}</p>}
      <div className="inline-form">
        <Button variant="ghost" size="sm" disabled={busy} onClick={clear}>
          {t('v02.newChat')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !state.conversationId}
          onClick={() =>
            setName(
              rows.data?.find((c) => c.id === state.conversationId)?.title ??
                '',
            )
          }
        >
          {t('v02.renameChat')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !state.conversationId}
          onClick={() => setConfirm(true)}
        >
          {t('v02.deleteChat')}
        </Button>
      </div>
      {name !== null && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(async () => {
              if (state.conversationId)
                await v02Api.renameConversation(state.conversationId, name);
              setName(null);
            });
          }}
        >
          <Input
            aria-label={t('v02.chatName')}
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="sm" disabled={!name.trim() || busy}>
            {t('common.confirm')}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('v02.deleteChat')}
        description={t('v02.deleteChatHint')}
        onConfirm={() =>
          action.mutateAsync(async () => {
            if (state.conversationId)
              await v02Api.deleteConversation(state.conversationId);
            clear();
          })
        }
      />
    </div>
  );
}
