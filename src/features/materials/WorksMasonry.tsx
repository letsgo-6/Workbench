import { useEffect, useRef, useState } from 'react';
import { masonry } from './masonry';
import { MaterialCard, type MaterialCardProps } from './MaterialCard';
import type { Material } from '@/types/bindings/Material';
export function WorksMasonry({
  items,
  activeId,
  ...actions
}: { items: Material[]; selection: string[]; activeId?: string } & Omit<
  MaterialCardProps,
  'item' | 'selected' | 'active'
>) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const dimensions = items.map((item) => {
    const cover =
      item.assets.find((a) => a.id === item.coverAssetId) ?? item.assets[0];
    return { id: item.id, width: cover?.width, height: cover?.height };
  });
  const [layout, setLayout] = useState(() => masonry(dimensions, width));
  const order = items.map((i) => i.id).join(',');
  if (layout.width !== width || layout.order !== order)
    setLayout(masonry(dimensions, width, layout));
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(1, entries[0]?.contentRect.width ?? 1)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="works-masonry" ref={host} style={{ height: layout.height }}>
      {items.map((item, index) => {
        const position = layout.positions[index];
        if (!position) return null;
        return (
          <div
            key={item.id}
            className="masonry-position"
            style={
              {
                left: position.x,
                top: position.y,
                width: position.width,
                height: position.height,
                '--material-media-height': `${position.mediaHeight}px`,
              } as React.CSSProperties
            }
          >
            <MaterialCard
              item={item}
              active={activeId === item.id}
              selected={actions.selection.includes(item.id)}
              {...actions}
            />
          </div>
        );
      })}
    </div>
  );
}
