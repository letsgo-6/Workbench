import { afterEach, expect, it, vi } from 'vitest';
import { loadMainRenderer } from './renderers/load';
import { emptyVisuals, sceneLayout } from './layout';
import { createStaticRenderer } from './renderers/static';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('autonomous overdue pulses preserve the ten-second idle downclock', async () => {
  let now = 0;
  let next: FrameRequestCallback = () => {};
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    next = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const context = Object.assign(
    {
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    },
    Object.fromEntries(
      [
        'setTransform',
        'clearRect',
        'save',
        'translate',
        'scale',
        'restore',
        'beginPath',
        'moveTo',
        'lineTo',
        'quadraticCurveTo',
        'bezierCurveTo',
        'closePath',
        'stroke',
        'fill',
        'fillRect',
        'arc',
        'ellipse',
        'rotate',
        'drawImage',
        'clip',
      ].map((name) => [name, () => {}]),
    ),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const host = document.createElement('div');
  const renderer = await loadMainRenderer();
  await renderer.mount(host);
  renderer.resize(sceneLayout(1440, 900, 180));
  renderer.setPhase('awake');
  renderer.setMotion('full');
  renderer.resume();
  let pulseAt = 2800;
  for (now = 16.67; now < 15000; now += 16.67) {
    if (now >= pulseAt) {
      await renderer.emit({ type: 'pulse', at: 'todo', tone: 'warm' });
      pulseAt += 2800;
    }
    next(now);
  }
  const idleFps = Number(host.dataset.fps);
  renderer.destroy();
  expect(idleFps).toBeGreaterThan(28);
  expect(idleFps).toBeLessThanOrEqual(31);
});

it('destroy settles an ongoing camera transition so motion changes cannot lock navigation', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  const renderer = await loadMainRenderer();
  await renderer.mount(document.createElement('div'));
  let finished = false;
  void renderer.zoom('idea', 'out').then(() => {
    finished = true;
  });
  renderer.destroy();
  await Promise.resolve();
  expect(finished).toBe(true);
});

it('keeps the static scene navigable without Canvas and never schedules animation', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const frame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', frame);
  const host = document.createElement('div');
  const renderer = createStaticRenderer();
  await renderer.mount(host);
  renderer.resize(sceneLayout(980, 640, 180));
  renderer.setTheme({
    primary: '#305f4e',
    foreground: '#26372f',
    background: '#fcfbf8',
    warning: '#9b5c26',
    muted: '#657167',
    dark: false,
  });
  const nodes = emptyVisuals();
  nodes.todo.overdue = true;
  renderer.setNodes(nodes);
  renderer.resume();
  await renderer.emit({ type: 'orb', to: 'todo', strength: 'event' });
  expect(host.querySelectorAll('[data-node]')).toHaveLength(6);
  expect(host.querySelectorAll('.static-outline')).toHaveLength(6);
  expect(
    host.querySelector('[data-node="todo"]')?.classList.contains('overdue'),
  ).toBe(true);
  expect(frame).not.toHaveBeenCalled();
  renderer.destroy();
  expect(host.childElementCount).toBe(0);
});
