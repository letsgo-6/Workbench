import type {
  NeuronRenderer,
  NodeId,
  RendererSignal,
  SceneLayout,
  ScenePhase,
} from '../../types';
import { emptyVisuals, nodeIds, sceneLayout } from '../../layout';
import { ease } from './geometry';
import { paint, type PaintState } from './paint';
import { createOpticsAtlas } from './optics';
export function createMembraneRenderer(): NeuronRenderer {
  let canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    host: HTMLElement;
  let raf = 0,
    paused = true,
    destroyed = false,
    last = 0,
    drawAt = 0,
    activity = performance.now();
  let frames = 0,
    cost = 0,
    sampleAt = 0,
    totalFrames = 0;
  let oldLayout: SceneLayout | undefined,
    target: SceneLayout | undefined,
    resizeAt = 0;
  const listeners = new Set<(s: RendererSignal) => void>(),
    born = new Set<NodeId>();
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let camera = { scale: 1, x: 0, y: 0 };
  let zoom:
    | { from: typeof camera; to: typeof camera; at: number; duration: number }
    | undefined;
  const state: PaintState = {
    layout: sceneLayout(1, 1, 0),
    nodes: emptyVisuals(),
    theme: {
      primary: '',
      foreground: '',
      background: '',
      warning: '',
      muted: '',
      dark: false,
    },
    motion: 'full',
    clock: 0,
    phase: 'forming',
    phaseStart: 0,
    thinking: false,
    engagement: nodeIds.map(() => 0),
    effects: [],
  };
  const signal = (s: RendererSignal) => listeners.forEach((cb) => cb(s));
  const diagnostic = (fps: number, ms: number) => {
    if (!host) return;
    host.dataset.frames = String(totalFrames);
    host.dataset.fps = fps.toFixed(1);
    host.dataset.frameMs = ms.toFixed(3);
    host.dataset.paused = String(paused);
    host.dataset.backend = state.opticsReady
      ? 'webgl-optics'
      : 'canvas-material';
    host.dispatchEvent(
      new CustomEvent('scene-metrics', {
        detail: { fps, frameMs: ms, frames: totalFrames, paused },
      }),
    );
  };
  function timeline() {
    const elapsed = state.clock - state.phaseStart;
    if (state.phase === 'forming' && elapsed >= 2100)
      signal({ type: 'formed' });
    if (state.phase === 'growing') {
      nodeIds.slice(1).forEach((node, i) => {
        if (elapsed >= 2550 + i * 140 && !born.has(node)) {
          born.add(node);
          signal({ type: 'born', node });
        }
      });
      if (elapsed >= 3110) {
        state.phase = 'awake';
        signal({ type: 'awake' });
      }
    }
  }
  function frame(now: number) {
    if (paused || destroyed) return;
    raf = requestAnimationFrame(frame);
    const interval =
      now - activity > 10000 && state.phase === 'awake' && !zoom
        ? 1000 / 30
        : 1000 / 60;
    if (now - drawAt < interval - 2) return;
    const started = performance.now(),
      delta = last ? Math.min(80, now - last) : 16.67;
    last = now;
    drawAt = now;
    state.clock += delta;
    if (target && oldLayout) {
      const k = ease((state.clock - resizeAt) / 300);
      state.layout = { ...target, nodes: { ...target.nodes } };
      for (const id of nodeIds) {
        const a = oldLayout.nodes[id],
          b = target.nodes[id];
        state.layout.nodes[id] = {
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          r: a.r + (b.r - a.r) * k,
        };
      }
      if (k >= 1) {
        target = undefined;
        oldLayout = undefined;
      }
    }
    timeline();
    const dpr = state.layout.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    if (zoom) {
      const k = ease((now - zoom.at) / zoom.duration);
      camera = {
        scale: zoom.from.scale + (zoom.to.scale - zoom.from.scale) * k,
        x: zoom.from.x + (zoom.to.x - zoom.from.x) * k,
        y: zoom.from.y + (zoom.to.y - zoom.from.y) * k,
      };
    }
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    paint(ctx, state);
    ctx.restore();
    state.effects = state.effects.filter((e) => {
      if (state.clock - e.start >= (e.event.type === 'orb' ? 900 : 1100)) {
        e.resolve();
        return false;
      }
      return true;
    });
    totalFrames++;
    frames++;
    cost += performance.now() - started;
    if (now - sampleAt >= 1000) {
      diagnostic((frames * 1000) / (now - sampleAt), cost / frames);
      sampleAt = now;
      frames = 0;
      cost = 0;
    }
  }
  const interaction = () => {
    activity = performance.now();
  };
  const renderer: NeuronRenderer = {
    async mount(target) {
      host = target;
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const context = canvas.getContext('2d');
      if (!context) throw Error('Canvas 2D unavailable');
      ctx = context;
      state.optics = createOpticsAtlas();
      host.append(canvas);
      window.addEventListener('pointermove', interaction, { passive: true });
      window.addEventListener('keydown', interaction);
    },
    resize(layout, opts) {
      canvas.width = Math.max(1, Math.round(layout.width * layout.dpr));
      canvas.height = Math.max(1, Math.round(layout.height * layout.dpr));
      if (opts?.animate && state.layout.width > 1) {
        oldLayout = state.layout;
        target = layout;
        resizeAt = state.clock;
      } else state.layout = layout;
      activity = performance.now();
    },
    setPhase(phase: ScenePhase, opts) {
      state.phase = phase;
      state.phaseStart = state.clock;
      born.clear();
      activity = performance.now();
      state.effects.forEach((e) => e.resolve());
      state.effects = [];
      if (opts?.instant || phase === 'awake') {
        state.phase = 'awake';
        signal({ type: 'awake' });
      }
    },
    setNodes(nodes) {
      state.nodes = nodes;
      if (
        nodeIds.some(
          (id) =>
            nodes[id].hover ||
            nodes[id].focus ||
            nodes[id].pending ||
            nodes[id].dropTarget,
        )
      )
        activity = performance.now();
    },
    setTheme(theme) {
      state.theme = theme;
      activity = performance.now();
    },
    setMotion(motion) {
      state.motion = motion;
      activity = performance.now();
    },
    emit(event) {
      if (destroyed) return Promise.resolve();
      if (event.type === 'thinking') {
        state.thinking = event.on;
        return Promise.resolve();
      }
      if (
        state.motion === 'off' ||
        (event.type === 'orb' &&
          event.strength === 'ambient' &&
          state.motion !== 'full')
      )
        return Promise.resolve();
      if (
        event.type === 'absorb' ||
        event.type === 'land' ||
        (event.type === 'orb' && event.strength === 'event')
      )
        activity = performance.now();
      if (event.type === 'orb')
        return new Promise<void>((resolve) => {
          state.effects.push({ event, start: state.clock, resolve });
        });
      state.effects.push({ event, start: state.clock, resolve: () => {} });
      return Promise.resolve();
    },
    zoom(node, dir) {
      const duration =
        state.motion === 'off' ? 0 : state.motion === 'lite' ? 300 : 600;
      const n = state.layout.nodes[node],
        scale = dir === 'in' ? 6 : 1;
      const to =
        dir === 'in' && state.motion === 'full'
          ? {
              scale,
              x: state.layout.width / 2 - n.x * scale,
              y: state.layout.height / 2 - n.y * scale,
            }
          : { scale: 1, x: 0, y: 0 };
      if (state.motion === 'full')
        zoom = { from: camera, to, at: performance.now(), duration };
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          camera = to;
          zoom = undefined;
          timers.delete(timer);
          resolve();
        }, duration);
        timers.set(timer, resolve);
      });
    },
    onSignal(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    pause() {
      paused = true;
      cancelAnimationFrame(raf);
      diagnostic(0, 0);
    },
    resume() {
      if (!paused || destroyed) return;
      paused = false;
      last = 0;
      drawAt = 0;
      sampleAt = performance.now();
      frames = 0;
      cost = 0;
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      destroyed = true;
      paused = true;
      cancelAnimationFrame(raf);
      timers.forEach((resolve, timer) => {
        clearTimeout(timer);
        resolve();
      });
      timers.clear();
      state.effects.forEach((e) => e.resolve());
      state.effects = [];
      listeners.clear();
      window.removeEventListener('pointermove', interaction);
      window.removeEventListener('keydown', interaction);
      state.optics?.destroy();
      state.optics = undefined;
      canvas?.remove();
    },
  };
  return renderer;
}
