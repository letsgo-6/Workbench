import type { NodeBox, NodeId, SceneLayout, NodeVisual } from './types';
export const nodeIds: NodeId[] = [
  'idea',
  'material',
  'todo',
  'tip',
  'skill',
  'prompt',
];
export const nodePositions: Record<NodeId, NodeBox> = {
  idea: { x: 600, y: 292, r: 112 },
  material: { x: 264, y: 138, r: 48 },
  todo: { x: 936, y: 138, r: 48 },
  tip: { x: 226, y: 432, r: 48 },
  skill: { x: 974, y: 432, r: 48 },
  prompt: { x: 600, y: 566, r: 48 },
};
export function sceneLayout(
  width: number,
  height: number,
  composer: number,
  dpr = 1,
): SceneLayout {
  const available = Math.max(1, height - 64 - composer - 46);
  const s = Math.max(
    0.08,
    Math.min(Math.max(1, width - 80) / 1200, available / 680),
  );
  const ox = (width - 1200 * s) / 2,
    oy = 64 + (available - 680 * s) / 2;
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    dpr: Math.min(2, Math.max(1, dpr)),
    nodes: Object.fromEntries(
      nodeIds.map((id) => {
        const n = nodePositions[id];
        return [id, { x: ox + n.x * s, y: oy + n.y * s, r: n.r * s }];
      }),
    ) as Record<NodeId, NodeBox>,
  };
}
export function emptyVisuals(): Record<NodeId, NodeVisual> {
  return Object.fromEntries(
    nodeIds.map((id) => [
      id,
      {
        hover: false,
        focus: false,
        pending: false,
        dropTarget: false,
        activity: 0,
        overdue: false,
      },
    ]),
  ) as Record<NodeId, NodeVisual>;
}
