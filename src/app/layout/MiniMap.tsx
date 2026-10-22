import { t } from '@/i18n';
import { nodeIds, nodePositions } from '@/features/home/scene/layout';
import type { NodeId } from '@/features/home/scene/types';
import { useHomeNavigation } from '@/features/home/navigation';
export function MiniMap({ current }: { current?: NodeId }) {
  const nav = useHomeNavigation();
  return (
    <nav className="module-minimap" aria-label={t('home.map')}>
      <svg viewBox="0 0 1200 680" preserveAspectRatio="none" aria-hidden="true">
        {nodeIds.slice(1).map((id) => (
          <path
            key={id}
            d={`M600 292 Q${nodePositions[id].x} 292 ${nodePositions[id].x} ${nodePositions[id].y}`}
          />
        ))}
        {nodeIds.map((id) => (
          <circle
            key={id}
            cx={nodePositions[id].x}
            cy={nodePositions[id].y}
            r={id === current ? 43 : 28}
            className={id === current ? 'current' : ''}
          />
        ))}
      </svg>
      {nodeIds.map((id, index) => (
        <button
          key={id}
          aria-current={id === current ? 'page' : undefined}
          aria-label={`${t(`nav.${id}`)}（${index}）`}
          title={`${t(`nav.${id}`)} · ${index}`}
          onClick={() => nav.enter(id)}
          style={{
            left: `${nodePositions[id].x / 12}%`,
            top: `${nodePositions[id].y / 6.8}%`,
          }}
        />
      ))}
    </nav>
  );
}
