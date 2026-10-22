import type { NodeBox } from '../../types';
export function branch(a: NodeBox, b: NodeBox, t: number, index: number) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.max(1, Math.hypot(dx, dy)),
    nx = -dy / len,
    ny = dx / len;
  const start = {
    x: a.x + (dx / len) * a.r * 0.82,
    y: a.y + (dy / len) * a.r * 0.82,
  };
  const end = {
    x: b.x - (dx / len) * b.r * 0.65,
    y: b.y - (dy / len) * b.r * 0.65,
  };
  const bend = Math.sin(index * 2 + 1) * len * 0.17;
  const u = 1 - t;
  const p1 = {
    x: start.x + dx * 0.3 + nx * bend,
    y: start.y + dy * 0.3 + ny * bend,
  };
  const p2 = {
    x: end.x - dx * 0.3 - nx * bend * 0.5,
    y: end.y - dy * 0.3 - ny * bend * 0.5,
  };
  return {
    x:
      u * u * u * start.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * end.x,
    y:
      u * u * u * start.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * end.y,
  };
}
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;
