import type {
  MotionLevel,
  NodeId,
  NodeVisual,
  SceneEvent,
  SceneLayout,
  ScenePhase,
  SceneTheme,
} from '../../types';
import { nodeIds } from '../../layout';
import { branch, clamp, ease } from './geometry';
import { membrane } from './cell';
import type { OpticsAtlas } from './optics';
import { dot, glow } from './light';
export interface Effect {
  event: SceneEvent;
  start: number;
  resolve: () => void;
}
export interface PaintState {
  layout: SceneLayout;
  nodes: Record<NodeId, NodeVisual>;
  theme: SceneTheme;
  motion: MotionLevel;
  clock: number;
  phase: ScenePhase;
  phaseStart: number;
  thinking: boolean;
  engagement: number[];
  effects: Effect[];
  optics?: OpticsAtlas;
  opticsReady?: boolean;
}
export function paint(ctx: CanvasRenderingContext2D, s: PaintState) {
  s.opticsReady = s.optics?.render(s) ?? false;
  const elapsed = s.clock - s.phaseStart,
    c = s.layout.nodes.idea;
  const growing = s.phase === 'growing',
    awake = s.phase === 'awake';
  for (let i = 1; i < nodeIds.length; i++) {
    const id = nodeIds[i]!,
      n = s.layout.nodes[id],
      progress = awake
        ? 1
        : growing
          ? clamp((elapsed - (i - 1) * 140) / 1900)
          : 0;
    if (!progress) continue;
    const active =
      s.nodes[id].hover || s.nodes[id].pending || s.nodes[id].dropTarget;
    for (let strand = 0; strand < 7; strand++) {
      ctx.strokeStyle = s.theme.primary;
      ctx.globalAlpha = active ? 0.3 : 0.07 + strand * 0.017;
      ctx.lineWidth = strand === 3 ? 1.4 : 0.45;
      ctx.beginPath();
      for (let step = 0; step <= 40; step++) {
        const u = (step / 40) * ease(progress),
          p = branch(c, n, u, i),
          offset =
            Math.sin(u * Math.PI) *
            ((strand - 3) * 1.9 +
              Math.sin(u * 12 + s.clock / 2400 + strand) * 1.5);
        if (step === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x + offset, p.y - offset);
      }
      ctx.stroke();
    }
    for (const u of [0.32, 0.66])
      if (progress > u) {
        const p = branch(c, n, u, i);
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + 8, p.y - 16, p.x + 21, p.y - 22);
        ctx.stroke();
      }
    const birth = awake ? 1 : clamp((elapsed - (i - 1) * 140 - 1900) / 650);
    if (birth > 0) membrane(ctx, n, i, s, birth);
    else if (progress > 0.9) {
      const p = branch(c, n, ease(progress), i);
      glow(ctx, p.x, p.y, 8, s.theme.primary, 0.6);
    }
  }
  const formed = s.phase === 'forming' ? clamp(elapsed / 2100) : 1;
  membrane(ctx, c, 0, s, formed);
  if (s.phase === 'forming' && s.motion === 'full')
    for (let i = 0; i < 65; i++) {
      const u = clamp((elapsed - i * 7) / 1600),
        a = i * 2.399,
        r = c.r * (3.2 - 2.4 * ease(u));
      dot(
        ctx,
        c.x + Math.cos(a) * r,
        c.y + Math.sin(a) * r,
        0.7,
        s.theme.primary,
        (1 - u) * 0.7,
      );
    }
  for (const effect of s.effects) {
    const e = effect.event,
      u = clamp((s.clock - effect.start) / (e.type === 'orb' ? 900 : 1100));
    if (e.type === 'orb') {
      const n = s.layout.nodes[e.to],
        index = nodeIds.indexOf(e.to);
      const p = branch(c, n, e.reverse ? 1 - u : u, index);
      const r = e.strength === 'event' ? 3 : 1.5;
      // A short fading wake follows the real event direction, including undo.
      for (let tail = 1; tail <= 7; tail++) {
        const q = u - tail * 0.012;
        if (q < 0) break;
        const wake = branch(c, n, e.reverse ? 1 - q : q, index);
        dot(
          ctx,
          wake.x,
          wake.y,
          r * (1 - tail / 9),
          s.theme.primary,
          (1 - tail / 8) * 0.35,
        );
      }
      glow(
        ctx,
        p.x,
        p.y,
        r * 6,
        s.theme.primary,
        e.strength === 'event' ? 0.55 : 0.2,
      );
      dot(ctx, p.x, p.y, r, s.theme.primary, 0.95);
    }
    if (e.type === 'absorb')
      for (let i = 0; i < Math.min(70, 16 + e.amount * 2); i++) {
        const q = clamp(u * 1.35 - i * 0.005),
          a = Math.sin(i * 13.7) * 0.5 + 0.5,
          b = Math.sin(i * 3.3) * 0.5 + 0.5;
        const x = e.from.x + 8 + a * Math.max(1, e.from.width - 16),
          y = e.from.y + b * e.from.height;
        dot(
          ctx,
          x + (c.x - x) * ease(q) + Math.sin(q * Math.PI) * Math.cos(i) * 60,
          y + (c.y - y) * ease(q),
          0.8,
          s.theme.primary,
          (1 - q) * 0.8,
        );
      }
    if (e.type === 'land' || e.type === 'pulse') {
      const n = s.layout.nodes[e.at],
        color =
          e.type === 'pulse' && e.tone === 'warm'
            ? s.theme.warning
            : s.theme.primary;
      glow(
        ctx,
        n.x - n.r * 0.2,
        n.y,
        n.r * (0.6 + u * 0.25),
        color,
        (1 - u) * 0.25,
      );
    }
  }
  ctx.globalAlpha = 1;
}
