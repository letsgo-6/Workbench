import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { BreakdownTodo } from '@/types/bindings/BreakdownTodo';
import { v02Api } from '@/lib/api/v02';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { useAction } from '../content/hooks';
export function BreakdownPreview({ initial }: { initial: BreakdownTodo[] }) {
  const [items, setItems] = useState(initial);
  const [created, setCreated] = useState(false);
  const action = useAction(async () => {
    const result = await v02Api.createTodos(
      items.map((i) => ({
        title: i.title.trim(),
        noteMd: i.note,
        dueDate: i.dueDate || null,
        priority: i.priority,
        sortOrder: 0,
        parentId: null,
        remindAt: null,
        tags: [],
      })),
    );
    setCreated(true);
    toast.success(t('v02.todosCreated', { count: result.length }));
  });
  function update(index: number, change: Partial<BreakdownTodo>) {
    setItems((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  }
  return (
    <section className="breakdown-preview">
      <h4>{t('v02.breakdownPreview')}</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('common.title')}</th>
              <th>{t('v02.note')}</th>
              <th>{t('todo.due')}</th>
              <th>{t('todo.priority')}</th>
              <th>{t('v02.removeSuggestion')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td>
                  <Input
                    aria-label={`${t('common.title')} ${index + 1}`}
                    value={item.title}
                    maxLength={500}
                    disabled={created}
                    onChange={(e) => update(index, { title: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    aria-label={`${t('v02.note')} ${index + 1}`}
                    value={item.note}
                    disabled={created}
                    onChange={(e) => update(index, { note: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    type="date"
                    aria-label={`${t('todo.due')} ${index + 1}`}
                    value={item.dueDate ?? ''}
                    disabled={created}
                    onChange={(e) =>
                      update(index, { dueDate: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label={`${t('todo.priority')} ${index + 1}`}
                    value={item.priority}
                    disabled={created}
                    onChange={(e) =>
                      update(index, { priority: Number(e.target.value) })
                    }
                  >
                    {([1, 2, 3] as const).map((p) => (
                      <option key={p} value={p}>
                        {t(
                          p === 1
                            ? 'todo.high'
                            : p === 2
                              ? 'todo.medium'
                              : 'todo.low',
                        )}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={created}
                    onClick={() =>
                      setItems((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    {t('v02.removeSuggestion')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        disabled={
          created ||
          action.isPending ||
          !items.length ||
          items.some((i) => !i.title.trim() || ![1, 2, 3].includes(i.priority))
        }
        onClick={() => action.mutate()}
      >
        {t('v02.createTodos')}
      </Button>
    </section>
  );
}
