import { t } from '@/i18n';
import type { HomeNode } from '@/types/bindings/HomeNode';
import type { NodeId, SceneLayout } from './scene/types';
export function NodePeek({
  node,
  layout,
  onEnter,
  onLeave,
  onOpen,
  onReturn,
}: {
  node: HomeNode;
  layout: SceneLayout;
  onEnter: () => void;
  onLeave: () => void;
  onOpen: (id: string) => void;
  onReturn: () => void;
}) {
  const box = layout.nodes[node.id as NodeId];
  const left =
    box.x < layout.width / 2
      ? box.x - box.r * 1.4 - 272
      : box.x + box.r * 1.4 + 12;
  const sub = (value: string | null) =>
    value === 'overdue'
      ? t('home.overdueItem')
      : value === 'work'
        ? t('home.work')
        : value === 'component'
          ? t('home.component')
          : value;
  return (
    <aside
      id="home-node-peek"
      className="node-peek"
      style={{
        left: Math.max(12, Math.min(layout.width - 272, left)),
        top: Math.max(70, Math.min(layout.height - 230, box.y - 60)),
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onKeyDown={(event) => {
        const buttons = Array.from(
          event.currentTarget.querySelectorAll('button'),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          onReturn();
        }
      }}
      aria-label={t(`nav.${node.id as NodeId}`)}
    >
      <h3>
        {t(`nav.${node.id as NodeId}`)}
        <span>
          {t(
            node.id === 'idea'
              ? 'home.todayIdeas'
              : node.id === 'todo'
                ? 'home.todayTodos'
                : 'home.total',
            { count: node.count },
          )}
        </span>
      </h3>
      {node.overdue > 0 && (
        <p className="node-overdue">
          {t('home.overdue', { count: node.overdue })}
        </p>
      )}
      {node.latest.length ? (
        node.latest.map((item) => (
          <button tabIndex={-1} key={item.id} onClick={() => onOpen(item.id)}>
            <span>{item.title || t('common.untitled')}</span>
            {item.sub && <small>{sub(item.sub)}</small>}
          </button>
        ))
      ) : (
        <p className="muted">{t('home.empty')}</p>
      )}
    </aside>
  );
}
