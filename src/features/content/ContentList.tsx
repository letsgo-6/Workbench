import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star, Check, Trash2 } from 'lucide-react';
import { contentApi, titleOf, bodyOf, type Entry } from '@/lib/api/content';
import { appApi } from '@/lib/api/app';
import type { EntityType } from '@/types/bindings/EntityType';
import { dayLabel, localDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUi } from '@/stores/ui';
import { t } from '@/i18n';
import { useAction } from './hooks';
type Row = { heading: string } | { item: Entry };
export function ContentList({
  kind,
  items,
  selectedId,
  onSelect,
  hasNext,
  fetchNext,
  cards,
  grouped,
  onContext,
  onDelete,
}: {
  kind: EntityType;
  items: Entry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  hasNext: boolean;
  fetchNext: () => void;
  cards: boolean;
  grouped: boolean;
  onContext: (item: Entry, x: number, y: number) => void;
  onDelete: (id: string) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const anchor = useRef(0);
  const selection = useUi((s) => s.selection);
  const setSelection = useUi((s) => s.setSelection);
  const action = useAction((run: () => Promise<unknown>) => run());
  const rows: Row[] = [];
  if (kind === 'tip' && grouped) {
    const groups = new Map<string, Entry[]>();
    for (const item of items) {
      const tools =
        'tools' in item && item.tools.length ? item.tools : [t('tip.noTool')];
      for (const tool of tools)
        groups.set(tool, [...(groups.get(tool) ?? []), item]);
    }
    for (const [heading, entries] of groups) {
      rows.push({ heading }, ...entries.map((item) => ({ item })));
    }
  } else {
    let last = '';
    for (const item of items) {
      const heading =
        kind === 'idea' && 'date' in item
          ? item.isStarred
            ? t('idea.starredGroup')
            : dayLabel(item.date)
          : '';
      if (heading && heading !== last) {
        rows.push({ heading });
        last = heading;
      }
      rows.push({ item });
    }
  }
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: (index) =>
      rows[index] && 'heading' in rows[index] ? 38 : cards ? 168 : 116,
    overscan: 6,
  });
  const visible = virtual.getVirtualItems();
  const lastIndex = visible.at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasNext && lastIndex >= rows.length - 5) fetchNext();
  }, [lastIndex, hasNext, fetchNext, rows.length]);
  function select(event: React.MouseEvent, item: Entry) {
    const index = items.findIndex((i) => i.id === item.id);
    if (event.shiftKey)
      setSelection([
        ...new Set([
          ...selection,
          ...items
            .slice(
              Math.min(anchor.current, index),
              Math.max(anchor.current, index) + 1,
            )
            .map((i) => i.id),
        ]),
      ]);
    else if (event.ctrlKey || event.metaKey) {
      setSelection(
        selection.includes(item.id)
          ? selection.filter((id) => id !== item.id)
          : [...selection, item.id],
      );
      anchor.current = index;
    } else {
      setSelection([]);
      anchor.current = index;
      onSelect(item.id);
    }
  }
  return (
    <div
      className="virtual-list"
      ref={parent}
      role="list"
      aria-label={t(`nav.${kind}`)}
    >
      <div
        style={{
          height: virtual.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {visible.map((row) => {
          const data = rows[row.index];
          if (!data) return null;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtual.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              {'heading' in data ? (
                <h3 className="list-group-title">{data.heading}</h3>
              ) : (
                <div
                  className={`content-row ${cards ? 'card-row' : ''} ${data.item.id === selectedId ? 'active' : ''} ${selection.includes(data.item.id) ? 'selected' : ''}`}
                  role="listitem"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContext(data.item, e.clientX, e.clientY);
                  }}
                >
                  <button
                    className="row-select"
                    onClick={(e) => select(e, data.item)}
                  >
                    <span className="row-title">
                      {data.item.isStarred && <Star fill="currentColor" />}
                      {titleOf(data.item) || t('common.untitled')}
                    </span>
                    <span className="row-snippet">
                      {bodyOf(data.item)
                        .replace(/[#*`]/g, '')
                        .slice(0, cards ? 220 : 90)}
                    </span>
                    <span className="row-meta">
                      {'subtaskTotal' in data.item &&
                        data.item.subtaskTotal > 0 && (
                          <span>
                            {t('v02.progress', {
                              done: data.item.subtaskDone,
                              total: data.item.subtaskTotal,
                            })}
                          </span>
                        )}
                      {'dueDate' in data.item && data.item.dueDate && (
                        <span
                          className={
                            data.item.dueDate < localDate() &&
                            data.item.status === 'todo'
                              ? 'carry'
                              : ''
                          }
                        >
                          {data.item.dueDate < localDate() &&
                          data.item.status === 'todo'
                            ? t('dashboard.carry', {
                                date: data.item.dueDate.slice(5),
                              })
                            : data.item.dueDate}
                        </span>
                      )}
                      {'priority' in data.item && (
                        <span
                          className={`priority priority-${data.item.priority}`}
                        >
                          {t(
                            data.item.priority === 1
                              ? 'todo.high'
                              : data.item.priority === 2
                                ? 'todo.medium'
                                : 'todo.low',
                          )}
                        </span>
                      )}
                      {data.item.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))}
                    </span>
                  </button>
                  <div className="row-actions">
                    {kind === 'todo' && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('todo.complete')}
                        onClick={() =>
                          action.mutate(() => appApi.toggleTodo(data.item.id))
                        }
                      >
                        <Check />
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('common.star')}
                      onClick={() =>
                        action.mutate(() =>
                          contentApi(kind).star(
                            data.item.id,
                            !data.item.isStarred,
                          ),
                        )
                      }
                    >
                      <Star />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('common.delete')}
                      onClick={() => onDelete(data.item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasNext && (
        <Button variant="ghost" onClick={fetchNext}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  );
}
