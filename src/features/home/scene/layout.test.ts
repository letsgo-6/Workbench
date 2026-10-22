import { expect, it } from 'vitest';
import { sceneLayout } from './layout';
it.each([
  [0, 0, 0],
  [1440, 900, 180],
  [800, 600, 260],
])('keeps finite positive boxes at %j', (w, h, c) => {
  const l = sceneLayout(w, h, c, 3);
  expect(l.dpr).toBe(2);
  Object.values(l.nodes).forEach((n) => {
    expect(n.r).toBeGreaterThan(0);
    expect(Number.isFinite(n.x + n.y)).toBe(true);
  });
  expect(l.nodes.material.x).toBeLessThan(l.nodes.idea.x);
});
it('scales around the space above the composer', () => {
  const a = sceneLayout(1440, 900, 160, 1),
    b = sceneLayout(1440, 900, 340, 1);
  expect(b.nodes.idea.r).toBeLessThan(a.nodes.idea.r);
  expect(b.nodes.idea.y).toBeLessThan(a.nodes.idea.y);
});
