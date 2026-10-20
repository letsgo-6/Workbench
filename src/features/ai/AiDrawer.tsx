import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/editor/MarkdownPreview';
import { providerApi } from '@/lib/api/providers';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { useAiStore } from './store';
import { ConversationHistory } from './ConversationHistory';
import { ChatComposer } from './ChatComposer';
import { useAiRun } from './useAiRun';
import { ResultView } from './ResultView';
import { AppError } from '@/lib/ipc';
export function AiDrawer() {
  const state = useAiStore();
  const providers = useQuery({
    queryKey: ['provider'],
    queryFn: providerApi.list,
  });
  const run = useAiRun();
  return (
    <aside
      className="ai-drawer"
      hidden={!state.open}
      aria-label={t('ai.title')}
    >
      <header>
        <h2>{t('ai.title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('ai.close')}
          onClick={() => state.patch({ open: false })}
        >
          <X />
        </Button>
      </header>
      <select
        aria-label={t('ai.model')}
        value={state.providerId ?? ''}
        onChange={(e) => state.patch({ providerId: e.target.value || null })}
      >
        <option value="">{t('ai.defaultProvider')}</option>
        {providers.data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.model}
          </option>
        ))}
      </select>
      {providers.error && <p role="alert">{providers.error.message}</p>}
      <ConversationHistory />
      <div className="ai-scroll">
        {state.truncated && <p role="status">{t('ai.truncated')}</p>}
        {state.error && (
          <div role="alert">
            <p>{state.error.message}</p>
            {state.error instanceof AppError && state.error.detail && (
              <p>{state.error.detail}</p>
            )}
            <Link to="/settings/models">{t('ai.settings')}</Link>
          </div>
        )}
        {state.status === 'cancelled' && (
          <p role="status">{t('ai.cancelled')}</p>
        )}
        {state.job?.mode === 'action' ? (
          <>
            <h3>{t(`ai.${state.job.action}`)}</h3>
            <ResultView
              key={state.job.id}
              job={state.job}
              text={state.text}
              status={state.status}
              regenerate={run.regenerate}
            />
          </>
        ) : (
          <>
            <div className="chat-messages">
              {state.messages.map((message, i) => (
                <section key={i} className={`chat-message ${message.role}`}>
                  <MarkdownPreview value={message.content} />
                </section>
              ))}
              {state.status === 'streaming' && (
                <pre className="stream-output">{state.text}</pre>
              )}
              {!state.messages.length && (
                <p className="muted">{t('ai.empty')}</p>
              )}
            </div>
            <Button
              variant="ghost"
              disabled={state.status === 'streaming'}
              onClick={() =>
                state.patch({
                  messages: [],
                  conversationId: null,
                  chatEpoch: state.chatEpoch + 1,
                  job: null,
                  text: '',
                  status: 'idle',
                  error: null,
                })
              }
            >
              {t('ai.clear')}
            </Button>
          </>
        )}
      </div>
      {state.status === 'streaming' && (
        <Button
          className="stop-ai"
          variant="outline"
          onClick={() =>
            void run.stop().catch((e: Error) => toast.error(e.message))
          }
        >
          {t('ai.stop')}
        </Button>
      )}
      <ChatComposer key={state.chatEpoch} />
    </aside>
  );
}
