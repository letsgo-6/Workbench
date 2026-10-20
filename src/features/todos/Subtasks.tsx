import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { contentApi } from '@/lib/api/content';
import { v02Api } from '@/lib/api/v02';
import { appApi } from '@/lib/api/app';
import { fromEntry, toInput } from '../content/draft';
import { t } from '@/i18n';
import { useAction } from '../content/hooks';
import type { Todo } from '@/types/bindings/Todo';
function Subtask({ item }: { item: Todo }) {
  const [title, setTitle] = useState(item.title);
  const action = useAction(async (run: () => Promise<unknown>) => run());
  return (
    <li className="subtask-row">
      <input
        type="checkbox"
        aria-label={`${t('todo.complete')} ${item.title}`}
        checked={item.status === 'done'}
        onChange={() => action.mutate(() => appApi.toggleTodo(item.id))}
      />
      <Input
        aria-label={t('v02.editSubtask')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== item.title)
            action.mutate(() =>
              contentApi('todo').update(
                item.id,
                toInput('todo', { ...fromEntry(item, 'todo'), title }),
              ),
            );
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={action.isPending}
        onClick={() => action.mutate(() => contentApi('todo').delete(item.id))}
      >
        {t('common.delete')}
      </Button>
    </li>
  );
}
export function Subtasks({ id }: { id: string }) {
  const rows = useQuery({
    queryKey: ['todo', 'children', id],
    queryFn: () => v02Api.children(id),
  });
  const [title, setTitle] = useState('');
  const action = useAction(async () => {
    await v02Api.createTodos([
      {
        title: title.trim(),
        noteMd: '',
        dueDate: null,
        priority: 2,
        sortOrder: rows.data?.length ?? 0,
        parentId: id,
        remindAt: null,
        tags: [],
      },
    ]);
    setTitle('');
  });
  return (
    <section className="detail-extra">
      <h3>
        {t('v02.subtasks')}{' '}
        <span className="muted">
          {rows.data?.filter((t) => t.status === 'done').length ?? 0}/
          {rows.data?.length ?? 0}
        </span>
      </h3>
      {rows.error && <p role="alert">{rows.error.message}</p>}
      <ul>
        {rows.data?.map((item) => (
          <Subtask key={`${item.id}-${item.updatedAt}`} item={item} />
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) action.mutate();
        }}
      >
        <Input
          aria-label={t('v02.subtaskTitle')}
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button variant="outline" disabled={!title.trim() || action.isPending}>
          {t('v02.addSubtask')}
        </Button>
      </form>
    </section>
  );
}
