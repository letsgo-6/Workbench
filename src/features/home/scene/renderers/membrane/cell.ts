import type { NodeBox } from '../../types';
import { nodeIds } from '../../layout';
import { ease } from './geometry';
import type { PaintState } from './paint';
import { cellTexture } from './material';
export function membrane(
  ctx: CanvasRenderingContext2D,
  box: NodeBox,
  index: number,
  s: PaintState,
  appear: number,
) {
  const v = s.nodes[nodeIds[index]!],
    t = (s.clock / 1000) * (s.motion === 'full' ? 1 : 0.6);
  const amp = s.motion === 'full' ? 1 : 0.4;
  const active = v.hover || v.focus || v.pending || v.dropTarget;
  const amount = s.engagement[index] ?? 0;
  const engagement = amount + ((active ? 1 : 0) - amount) * 0.14;
  s.engagement[index] = engagement;
  const color = v.overdue ? s.theme.warning : s.theme.primary;
  const r = box.r * ease(appear);
  if (r < 0.5) return;
  const contraction =
    (index === 0
      ? Math.sin(t * 1.7)
      : Math.sin(t * 2.5 + index * 1.7) * 0.7 +
        Math.sin(t * 5 + index * 3.4) * 0.3) * amp;
  ctx.save();
  ctx.translate(box.x, box.y);
  // Skin and inner tissue contract out of phase, like a translucent bell.
  ctx.rotate(Math.sin(t * 0.8 + index) * 0.09 * amp);
  // The shader deforms its surface; Canvas fallback uses a stronger visible bell contraction.
  if (s.opticsReady && s.optics) {
    ctx.globalAlpha = appear;
    s.optics.draw(ctx, index, r);
    ctx.restore();
    return;
  }
  const surface = cellTexture(index, s.theme, color);
  ctx.scale(
    1 + contraction * (index === 0 ? 0.065 : 0.14),
    1 - contraction * (index === 0 ? 0.075 : 0.11),
  );
  ctx.globalAlpha = appear;
  ctx.drawImage(surface.skin, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  ctx.save();
  ctx.translate(Math.sin(t * 0.9 + index) * r * 0.025, contraction * r * 0.025);
  ctx.rotate(-Math.sin(t * 0.6 + index) * 0.12 * amp);
  ctx.globalAlpha = 0.9 * appear;
  ctx.drawImage(surface.tissue, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  ctx.restore();
  ctx.save();
  ctx.scale(1 - contraction * 0.012, 1 + contraction * 0.016);
  ctx.globalAlpha = appear;
  ctx.drawImage(surface.front, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  const warm = v.overdue ? (1 + Math.sin((t * 2 * Math.PI) / 2.8)) * 0.1 : 0;
  ctx.globalAlpha =
    appear *
    Math.min(
      1,
      (s.theme.dark ? 0.35 : 0.12) +
        engagement * 0.65 +
        warm +
        (s.thinking && index === 0 ? 0.22 + Math.sin(t * 2) * 0.12 : 0),
    );
  ctx.drawImage(surface.light, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  ctx.restore();
  // Cilia lag behind the body. Hover lights tissue, without an enclosing ring.
  for (let j = 0; j < (index === 0 ? 36 : 23); j++) {
    const a = index === 0 ? j * 2.399 : Math.PI * (0.18 + (j / 22) * 0.64),
      px = Math.cos(a),
      py = Math.sin(a);
    const sway = Math.sin(t * 1.9 - j * 0.7) * amp;
    const len =
      r * ((index === 0 ? 0.18 : 0.28) + 0.3 * Math.sin(j * 5.1) ** 2);
    const x = px * r * (index === 0 ? 0.9 : 0.78),
      y =
        index === 0 ? py * r * 0.82 : -r * 0.06 + Math.sin(j * 2.1) * r * 0.08;
    ctx.globalAlpha = (0.08 + (j % 5) * 0.035) * appear;
    ctx.strokeStyle = j % 4 ? color : s.theme.foreground;
    ctx.lineWidth = j % 3 ? 0.45 : 0.75;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + px * len * 0.7 - py * sway * r * 0.12,
      y + py * len * 0.7 + px * sway * r * 0.12,
      x + px * len - py * r * 0.1,
      y + py * len + px * r * 0.1,
      x + px * len * 1.35 - py * sway * r * 0.17,
      y + py * len * 1.35 + px * sway * r * 0.17,
    );
    ctx.stroke();
  }
  ctx.restore();
}
