import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowUpRight,
  Lightbulb,
  Star,
  CircleCheck,
  Circle,
} from 'lucide-react';
import { appApi } from '@/lib/api/app';
import { routes, titleOf, type Entry } from '@/lib/api/content';
import type { EntityType } from '@/types/bindings/EntityType';
import { localDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Loading, Failure } from '@/components/common/Feedback';
import { t } from '@/i18n';
import { QuickInput } from './QuickInput';
import { useAction } from '../content/hooks';
import { requestAction, useAiStore } from '../ai/store';
import { toast } from 'sonner';
function Recent({ kind, items }: { kind: EntityType; items: Entry[] }) {
  return (
    <section className="recent-section">
      <div className="section-title">
        <h3>{t(`nav.${kind}`)}</h3>
        <Link
          to={`/${routes[kind]}`}
          aria-label={`${t('dashboard.viewAll')} ${t(`nav.${kind}`)}`}
        >
          <ArrowUpRight />
        </Link>
      </div>
      {items.length ? (
        items.map((item) => (
          <Link
            key={item.id}
            className="recent-link"
            to={`/${routes[kind]}/${item.id}`}
          >
            <span>{titleOf(item) || t('common.untitled')}</span>
            <ArrowUpRight />
          </Link>
        ))
      ) : (
        <p className="muted">{t('common.empty')}</p>
      )}
    </section>
  );
}
export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: appApi.dashboard,
  });
  const action = useAction(appApi.toggleTodo);
  const today = localDate();
  const aiBusy = useAiStore((s) => s.status === 'streaming');
  return (
    <div className="dashboard page-scroll">
      <header className="page-header">
        <div className="date-line">
          {new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </div>
        <h1>
          {t('nav.today')}
          <span className="heading-dot" />
        </h1>
        <p>{t('dashboard.greeting')}</p>
      </header>
      <QuickInput />
      <Button
        variant="outline"
        className="daily-summary"
        disabled={aiBusy}
        onClick={() => {
          void requestAction('daily_summary', []).catch((e: Error) =>
            toast.error(e.message),
          );
        }}
      >
        {t('v02.summary')}
      </Button>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data && (
          <>
            <div className="today-columns">
              <section>
                <div className="section-title">
                  <h2>
                    <CircleCheck />
                    {t('dashboard.todos')}
                    <span>
                      {
                        query.data.todos.filter((i) => i.status === 'todo')
                          .length
                      }
                    </span>
                  </h2>
                  <Link to="/todos?view=today">
                    {t('dashboard.viewAll')}
                    <ArrowUpRight />
                  </Link>
                </div>
                {!query.data.todos.length ? (
                  <p className="section-empty">{t('dashboard.todoEmpty')}</p>
                ) : (
                  <div className="today-todos">
                    {query.data.todos.map((item) => (
                      <div
                        key={item.id}
                        className={`dashboard-todo ${item.status === 'done' ? 'done' : ''}`}
                      >
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t(
                            item.status === 'done'
                              ? 'todo.reopen'
                              : 'todo.complete',
                          )}
                          onClick={() => action.mutate(item.id)}
                        >
                          {item.status === 'done' ? (
                            <CircleCheck />
                          ) : (
                            <Circle />
                          )}
                        </Button>
                        <Link to={`/todos/${item.id}`}>
                          <strong>{item.title}</strong>
                          {item.dueDate &&
                            item.dueDate < today &&
                            item.status === 'todo' && (
                              <span className="carry">
                                {t('dashboard.carry', {
                                  date: item.dueDate.slice(5),
                                })}
                              </span>
                            )}
                        </Link>
                        <span className={`priority priority-${item.priority}`}>
                          {t(
                            item.priority === 1
                              ? 'todo.high'
                              : item.priority === 2
                                ? 'todo.medium'
                                : 'todo.low',
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <div className="section-title">
                  <h2>
                    <Lightbulb />
                    {t('dashboard.ideas')}
                    <span>{query.data.ideas.length}</span>
                  </h2>
                  <Link to="/ideas">
                    {t('dashboard.viewAll')}
                    <ArrowUpRight />
                  </Link>
                </div>
                {!query.data.ideas.length ? (
                  <p className="section-empty">{t('dashboard.ideaEmpty')}</p>
                ) : (
                  <div className="today-ideas">
                    {query.data.ideas.map((item) => (
                      <Link key={item.id} to={`/ideas/${item.id}`}>
                        <span className="idea-time">
                          {new Date(item.createdAt).toLocaleTimeString(
                            'zh-CN',
                            { hour: '2-digit', minute: '2-digit' },
                          )}
                        </span>
                        <p>
                          {item.isStarred && <Star fill="currentColor" />}
                          {item.contentMd}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="recent-heading">
              <h2>{t('dashboard.recent')}</h2>
            </div>
            <div className="recent-grid">
              <Recent kind="tip" items={query.data.recentTips} />
              <Recent kind="skill" items={query.data.recentSkills} />
              <Recent kind="prompt" items={query.data.recentPrompts} />
            </div>
          </>
        )
      )}
    </div>
  );
}
