import type { CaptureItem } from '@/types/bindings/CaptureItem';
import type { EntityType } from '@/types/bindings/EntityType';
export function convert(
  item: CaptureItem,
  kind: EntityType,
  today: string,
): CaptureItem {
  return {
    ...item,
    kind,
    materialKind: item.materialKind ?? (kind === 'material' ? 'work' : null),
    body: item.source,
    title:
      kind === 'todo' && !item.title.trim()
        ? Array.from(item.source.split('\n')[0] ?? '')
            .slice(0, 500)
            .join('')
        : item.title,
    date: kind === 'idea' && item.kind === 'todo' ? today : item.date,
  };
}
