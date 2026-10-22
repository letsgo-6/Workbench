import { MaterialCard, type MaterialCardProps } from './MaterialCard';
import type { Material } from '@/types/bindings/Material';
export function ComponentGrid({
  items,
  activeId,
  selection,
  ...actions
}: { items: Material[]; selection: string[]; activeId?: string } & Omit<
  MaterialCardProps,
  'item' | 'selected' | 'active'
>) {
  return (
    <div className="component-grid">
      {items.map((item) => (
        <MaterialCard
          key={item.id}
          item={item}
          active={activeId === item.id}
          selected={selection.includes(item.id)}
          {...actions}
        />
      ))}
    </div>
  );
}
