import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import type { HomeNode } from '@/types/bindings/HomeNode';
import { nodeIds } from './scene/layout';
import type { NodeId, SceneLayout } from './scene/types';
import type { SceneState } from './scene/controller';
import { NodePeek } from './NodePeek';
export function NodeOverlay({
  layout,
  state,
  nodes,
  onOpen,
  onWake,
  onHighlight,
}: {
  layout: SceneLayout;
  state: SceneState;
  nodes: HomeNode[];
  onOpen: (node: NodeId, id?: string) => void;
  onWake: () => void;
  onHighlight: (id: NodeId | null, focus: boolean) => void;
}) {
  const [peek, setPeek] = useState<NodeId | null>(null);
  const show = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(show.current);
      clearTimeout(hide.current);
    },
    [],
  );
  const enter = (id: NodeId, focus = false) => {
    clearTimeout(hide.current);
    clearTimeout(show.current);
    onHighlight(id, focus);
    if (state.phase === 'awake') {
      if (focus) setPeek(id);
      else show.current = setTimeout(() => setPeek(id), 260);
    }
  };
  const leave = () => {
    clearTimeout(show.current);
    hide.current = setTimeout(() => {
      setPeek(null);
      onHighlight(null, false);
    }, 140);
  };
  const node = nodes.find((n) => n.id === peek);
  return (
    <div className="node-overlay">
      {nodeIds.map((id, index) => {
        const box = layout.nodes[id],
          n = nodes.find((n) => n.id === id);
        const visible =
          state.phase === 'awake' || (id !== 'idea' && state.born.includes(id));
        const open = () => {
          setPeek(null);
          if (state.phase !== 'awake') {
            onWake();
            return;
          }
          onOpen(id);
        };
        const props = {
          onMouseEnter: () => enter(id),
          onMouseLeave: leave,
          onClick: open,
        };
        return (
          <div key={id}>
            <button
              {...props}
              className="node-hit"
              data-node-id={id}
              aria-expanded={peek === id}
              aria-controls={peek === id ? 'home-node-peek' : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && state.phase === 'awake') {
                  e.preventDefault();
                  setPeek(id);
                  const first = () =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '#home-node-peek button',
                      )
                      ?.focus();
                  if (peek === id) first();
                  else requestAnimationFrame(first);
                }
              }}
              aria-label={`${t(`nav.${id}`)}，${n?.count ?? 0}`}
              onFocus={() => enter(id, true)}
              onBlur={leave}
              style={{
                left: box.x,
                top: box.y,
                width: box.r * 2.3,
                height: box.r * 2.3,
              }}
            />
            <button
              {...props}
              tabIndex={-1}
              className={`node-label ${visible ? 'visible' : ''} ${n?.overdue ? 'node-overdue' : ''}`}
              style={{
                left: box.x,
                top:
                  id === 'idea'
                    ? box.y - box.r * 1.42 - 26
                    : box.y + box.r * 1.55,
              }}
            >
              {t(`nav.${id}`)}
              <span key={n?.count} className="node-count">
                {n?.count ?? '·'}
              </span>
              <kbd>{index}</kbd>
            </button>
          </div>
        );
      })}
      {state.phase === 'dormant' && (
        <p
          className="wake-hint"
          style={{
            left: layout.nodes.idea.x,
            top: layout.nodes.idea.y + layout.nodes.idea.r * 1.45,
          }}
        >
          {t('home.wake')}
        </p>
      )}
      {peek && node && (
        <NodePeek
          node={node}
          layout={layout}
          onEnter={() => clearTimeout(hide.current)}
          onLeave={leave}
          onOpen={(id) => onOpen(peek, id)}
          onReturn={() => {
            document
              .querySelector<HTMLButtonElement>(
                `.node-hit[data-node-id="${peek}"]`,
              )
              ?.focus();
            setPeek(null);
          }}
        />
      )}
    </div>
  );
}
