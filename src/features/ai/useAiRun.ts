import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Channel, aiApi } from '@/lib/api/ai';
import { AppError } from '@/lib/ipc';
import type { AiStreamEvent } from '@/types/bindings/AiStreamEvent';
import { useAiStore, type Job } from './store';
export function useAiRun() {
  const client = useQueryClient();
  const job = useAiStore((s) => s.job);
  useEffect(() => {
    if (!job) return;
    const channel = new Channel<AiStreamEvent>();
    let active = true;
    const patch = (
      change: Parameters<ReturnType<typeof useAiStore.getState>['patch']>[0],
    ) => {
      if (active && useAiStore.getState().job?.id === job.id)
        useAiStore.getState().patch(change);
    };
    channel.onmessage = (event) => {
      if (!active) return;
      const state = useAiStore.getState();
      if (state.job?.id !== job.id) return;
      switch (event.type) {
        case 'started':
          patch({ truncated: event.truncated });
          break;
        case 'delta':
          patch({ text: state.text + event.text });
          break;
        case 'done':
          patch({
            status: 'done',
            ...(job.mode === 'chat'
              ? {
                  messages: [
                    ...state.messages,
                    { role: 'assistant', content: state.text },
                  ],
                }
              : {}),
          });
          break;
        case 'cancelled':
          patch({ status: 'cancelled' });
          break;
        case 'error':
          patch({ status: 'error', error: new AppError(event.error) });
          break;
      }
    };
    const run =
      job.mode === 'action'
        ? aiApi.action(
            {
              requestId: job.id,
              action: job.action,
              providerId: job.providerId,
              input: job.input,
              extra: null,
            },
            channel,
          )
        : aiApi.chat(
            {
              requestId: job.id,
              providerId: job.providerId,
              messages: job.messages,
              conversationId: job.conversationId,
              refs: job.refs,
            },
            channel,
          );
    void run
      .then((conversationId) => {
        if (job.mode === 'chat') {
          if (typeof conversationId === 'string') patch({ conversationId });
          void client.invalidateQueries({ queryKey: ['conversation'] });
        }
      })
      .catch((error: Error) => patch({ status: 'error', error }));
    return () => {
      active = false;
      void aiApi.cancel(job.id).catch(() => {});
    };
  }, [job, client]);
  return {
    stop: () => (job ? aiApi.cancel(job.id) : Promise.resolve()),
    regenerate: () => {
      const s = useAiStore.getState();
      if (s.job && s.status !== 'streaming')
        s.patch({
          job: { ...s.job, id: crypto.randomUUID() } as Job,
          text: '',
          status: 'streaming',
          error: null,
        });
    },
  };
}
