export interface MasonryItem {
  id: string;
  width?: number | null;
  height?: number | null;
}
export interface Placement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mediaHeight: number;
  column: number;
}
export interface MasonryLayout {
  width: number;
  columns: number;
  positions: Placement[];
  height: number;
  order: string;
}
export function masonry(
  items: MasonryItem[],
  width: number,
  previous?: MasonryLayout,
): MasonryLayout {
  width = Math.max(1, width);
  const gap = 18;
  const columns = Math.max(1, Math.floor((width + gap) / (240 + gap)));
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const reusable =
    previous?.width === width &&
    previous.positions.every((p, i) => items[i]?.id === p.id);
  const positions = reusable ? [...previous.positions] : [];
  const heights = Array<number>(columns).fill(0);
  for (const p of positions) heights[p.column] = p.y + p.height + gap;
  for (const item of items.slice(positions.length)) {
    const column = heights.indexOf(Math.min(...heights));
    const ratio =
      item.width && item.width > 0 && item.height && item.height > 0
        ? item.height / item.width
        : 2 / 3;
    const mediaHeight = Math.max(1, columnWidth * ratio);
    const height = mediaHeight + 132;
    positions.push({
      id: item.id,
      x: column * (columnWidth + gap),
      y: heights[column] ?? 0,
      width: columnWidth,
      height,
      mediaHeight,
      column,
    });
    heights[column] = (heights[column] ?? 0) + height + gap;
  }
  return {
    width,
    columns,
    positions,
    height: Math.max(0, ...heights) - (items.length ? gap : 0),
    order: items.map((i) => i.id).join(','),
  };
}
