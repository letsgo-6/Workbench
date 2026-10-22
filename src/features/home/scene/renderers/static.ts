import type {
  NeuronRenderer,
  NodeVisual,
  NodeId,
  RendererSignal,
  SceneLayout,
  SceneTheme,
} from '../types';
import { emptyVisuals, nodeIds } from '../layout';
import { branch } from './membrane/geometry';
import { cellTexture } from './membrane/material';
import { createOpticsAtlas, type OpticsAtlas } from './membrane/optics';
const urls = new WeakMap<HTMLCanvasElement, string>();
const source = (canvas: HTMLCanvasElement) => {
  let url = urls.get(canvas);
  if (!url) {
    url = canvas.toDataURL();
    urls.set(canvas, url);
  }
  return url;
};
export function createStaticRenderer(): NeuronRenderer {
  let host: HTMLElement, svg: SVGSVGElement;
  let optics: OpticsAtlas | undefined;
  let layout: SceneLayout | undefined, theme: SceneTheme | undefined;
  let nodes: Record<NodeId, NodeVisual> = emptyVisuals();
  const listeners = new Set<(s: RendererSignal) => void>();
  const element = (name: string) =>
    document.createElementNS('http://www.w3.org/2000/svg', name);
  const update = () => {
    for (const id of nodeIds) {
      svg
        .querySelector(`[data-node="${id}"]`)
        ?.setAttribute(
          'class',
          [
            'static-cell',
            nodes[id].hover || nodes[id].focus ? 'active' : '',
            nodes[id].pending || nodes[id].dropTarget ? 'pending' : '',
            nodes[id].overdue ? 'overdue' : '',
          ].join(' '),
        );
    }
  };
  const draw = () => {
    if (!layout || !theme) return;
    const l = layout,
      t = theme;
    svg.setAttribute('viewBox', `0 0 ${l.width} ${l.height}`);
    svg.replaceChildren();
    const optical = optics?.render({
      clock: 1500,
      theme: t,
      motion: 'off',
      thinking: false,
      nodes,
      engagement: [],
    });
    const c = l.nodes.idea;
    for (const [i, id] of nodeIds.entries()) {
      const n = l.nodes[id];
      if (id !== 'idea') {
        const line = element('path');
        line.setAttribute(
          'd',
          Array.from({ length: 41 }, (_, j) => {
            const p = branch(c, n, j / 40, i);
            return `${j ? 'L' : 'M'}${p.x},${p.y}`;
          }).join(' '),
        );
        line.setAttribute('class', 'static-branch');
        svg.append(line);
      }
      const group = element('g');
      group.setAttribute('data-node', id);
      try {
        if (optical && optics) {
          const still = document.createElement('canvas');
          still.width = still.height = i === 0 ? 384 : 160;
          const ctx = still.getContext('2d');
          if (!ctx) throw Error('Canvas 2D unavailable');
          ctx.translate(still.width / 2, still.height / 2);
          optics.draw(ctx, i, still.width / 2.7);
          const image = element('image');
          image.setAttribute('href', source(still));
          image.setAttribute('x', String(n.x - n.r * 1.35));
          image.setAttribute('y', String(n.y - n.r * 1.35));
          image.setAttribute('width', String(n.r * 2.7));
          image.setAttribute('height', String(n.r * 2.7));
          image.setAttribute('class', 'static-optics');
          group.append(image);
        } else {
          const texture = cellTexture(
            i,
            t,
            nodes[id].overdue ? t.warning : t.primary,
          );
          for (const key of ['skin', 'tissue', 'front', 'light'] as const) {
            const image = element('image');
            image.setAttribute('href', source(texture[key]));
            image.setAttribute('x', String(n.x - n.r * 1.3));
            image.setAttribute('y', String(n.y - n.r * 1.3));
            image.setAttribute('width', String(n.r * 2.6));
            image.setAttribute('height', String(n.r * 2.6));
            if (key === 'light')
              image.setAttribute('class', 'static-transmission');
            group.append(image);
          }
        }
      } catch {
        // Canvas-unavailable fallback remains pure SVG and fully navigable.
        const path = element('path');
        path.setAttribute('class', 'static-outline');
        path.setAttribute(
          'd',
          Array.from({ length: 97 }, (_, j) => {
            const a = (j / 96) * Math.PI * 2,
              r =
                n.r *
                (0.88 + 0.08 * Math.sin(a * 3 + i) + 0.04 * Math.sin(a * 7));
            return `${j ? 'L' : 'M'}${n.x + Math.cos(a) * r},${n.y + Math.sin(a) * r * 0.86}`;
          }).join(' ') + ' Z',
        );
        group.append(path);
      }
      svg.append(group);
    }
    update();
  };
  return {
    async mount(target) {
      host = target;
      optics = createOpticsAtlas();
      Object.assign(host.dataset, {
        frames: '0',
        backend: 'static-svg',
        fps: '0',
        frameMs: '0',
        paused: 'true',
      });
      host.dispatchEvent(
        new CustomEvent('scene-metrics', {
          detail: { fps: 0, frameMs: 0, frames: 0, paused: true },
        }),
      );
      svg = element('svg') as SVGSVGElement;
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('static-neuron');
      host.append(svg);
    },
    resize(l) {
      layout = l;
      draw();
    },
    setPhase() {
      listeners.forEach((cb) => cb({ type: 'awake' }));
    },
    setNodes(value) {
      const recolor = nodeIds.some(
        (id) => value[id].overdue !== nodes[id].overdue,
      );
      nodes = value;
      if (recolor) draw();
      else update();
    },
    setTheme(t) {
      theme = t;
      host.style.setProperty('--scene-primary', t.primary);
      host.style.setProperty('--scene-warning', t.warning);
      draw();
    },
    setMotion() {},
    async emit() {},
    async zoom() {},
    onSignal(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    pause() {},
    resume() {},
    destroy() {
      optics?.destroy();
      optics = undefined;
      svg?.remove();
      listeners.clear();
    },
  };
}
