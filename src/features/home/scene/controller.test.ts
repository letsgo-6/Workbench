import { afterEach, expect, it, vi } from 'vitest';
import { SceneController } from './controller';
import { HomeEvents } from './events';
import type { NeuronRenderer, RendererSignal } from './types';
function mockRenderer() {
  let signal: (s: RendererSignal) => void = () => {};
  const renderer: NeuronRenderer = {
    mount: vi.fn(async () => {}),
    resize: vi.fn(),
    setPhase: vi.fn(),
    setNodes: vi.fn(),
    setTheme: vi.fn(),
    setMotion: vi.fn(),
    emit: vi.fn(async () => {}),
    zoom: vi.fn(async () => {}),
    onSignal: (cb) => {
      signal = cb;
      return () => {};
    },
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
  };
  return { renderer, signal: (s: RendererSignal) => signal(s) };
}
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});
it.each(['daily', 'always', 'never'])(
  'intro %s persists only when awake',
  (intro) => {
    const { renderer, signal } = mockRenderer();
    const c = new SceneController(renderer, {
      intro,
      motion: 'full',
      date: '2026-10-21',
      storage: localStorage,
      change: vi.fn(),
    });
    c.start();
    expect(c.state.phase).toBe(intro === 'never' ? 'awake' : 'forming');
    if (intro !== 'never') {
      expect(localStorage.getItem('wb.home.introDate')).toBeNull();
      signal({ type: 'formed' });
      expect(c.state.phase).toBe('dormant');
      c.wake();
      c.wake();
      expect(renderer.setPhase).toHaveBeenCalledTimes(3);
      signal({ type: 'born', node: 'material' });
      expect(c.state.born).toContain('material');
      expect(localStorage.getItem('wb.home.introDate')).toBeNull();
      signal({ type: 'awake' });
    }
    expect(localStorage.getItem('wb.home.introDate')).toBe('2026-10-21');
    c.destroy();
  },
);
it('same-day daily skips; replay clears date and reduced motion wakes instantly', () => {
  localStorage.setItem('wb.home.introDate', '2026-10-21');
  const { renderer, signal } = mockRenderer();
  const c = new SceneController(renderer, {
    intro: 'daily',
    motion: 'lite',
    date: '2026-10-21',
    storage: localStorage,
    change: vi.fn(),
  });
  c.start();
  expect(c.state.phase).toBe('awake');
  c.replay();
  expect(localStorage.getItem('wb.home.introDate')).toBeNull();
  signal({ type: 'formed' });
  c.wake();
  expect(c.state.phase).toBe('awake');
  c.destroy();
});
it('pauses, resumes and schedules ambient only while awake/full/active', () => {
  vi.useFakeTimers();
  const { renderer, signal } = mockRenderer();
  const c = new SceneController(renderer, {
    intro: 'always',
    motion: 'full',
    date: 'x',
    storage: localStorage,
    change: vi.fn(),
  });
  c.start();
  c.setActive(true);
  vi.advanceTimersByTime(5000);
  expect(renderer.emit).not.toHaveBeenCalled();
  signal({ type: 'awake' });
  vi.advanceTimersByTime(2800);
  expect(renderer.emit).toHaveBeenCalled();
  c.setActive(false);
  expect(renderer.pause).toHaveBeenCalled();
  vi.mocked(renderer.emit).mockClear();
  vi.advanceTimersByTime(10000);
  expect(renderer.emit).not.toHaveBeenCalled();
  c.setMotion('lite');
  c.setActive(true);
  expect(renderer.resume).toHaveBeenCalled();
  vi.advanceTimersByTime(10000);
  expect(renderer.emit).not.toHaveBeenCalled();
  c.destroy();
});
it('defers counts until orb arrival, reverses undo, deduplicates and collapses off-home creates', async () => {
  const { renderer } = mockRenderer(),
    refresh = vi.fn();
  let arrive: () => void = () => {};
  vi.mocked(renderer.emit).mockImplementation((e) =>
    e.type === 'orb'
      ? new Promise<void>((r) => {
          arrive = r;
        })
      : Promise.resolve(),
  );
  let now = 100;
  const events = new HomeEvents(
    renderer,
    refresh,
    () => now,
    async () => {},
  );
  events.setActive(true);
  await events.handle({ type: 'saving', nodes: ['todo'] });
  await events.handle({ type: 'data', entity: 'all', op: 'create' });
  expect(renderer.emit).not.toHaveBeenCalled();
  await events.handle({ type: 'data', entity: 'todo', op: 'create' });
  expect(refresh).not.toHaveBeenCalled();
  const delivery = events.handle({ type: 'committed', nodes: ['todo'] });
  expect(refresh).not.toHaveBeenCalled();
  arrive();
  await delivery;
  expect(refresh).toHaveBeenCalledTimes(1);
  await events.handle({ type: 'data', entity: 'todo', op: 'create' });
  expect(refresh).toHaveBeenCalledTimes(1);
  const undo = events.handle({ type: 'undone', nodes: ['todo'] });
  expect(renderer.emit).toHaveBeenLastCalledWith({
    type: 'orb',
    to: 'todo',
    strength: 'event',
    reverse: true,
  });
  arrive();
  await undo;
  events.setActive(false);
  now = 10000;
  await events.handle({ type: 'data', entity: 'material', op: 'create' });
  await events.handle({ type: 'data', entity: 'material', op: 'create' });
  vi.mocked(renderer.emit).mockResolvedValue();
  events.setActive(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(renderer.emit).toHaveBeenLastCalledWith({
    type: 'orb',
    to: 'material',
    strength: 'event',
    reverse: false,
  });
  events.destroy();
});
it('maps analysis/direct/settled and starts two deliveries 220ms apart', async () => {
  vi.useFakeTimers();
  const { renderer } = mockRenderer(),
    refresh = vi.fn(),
    events = new HomeEvents(renderer, refresh);
  events.setActive(true);
  const from = new DOMRect(10, 20, 30, 40);
  await events.handle({ type: 'analyzing', from, amount: 20 });
  expect(renderer.emit).toHaveBeenNthCalledWith(1, {
    type: 'absorb',
    from,
    amount: 20,
  });
  expect(renderer.emit).toHaveBeenNthCalledWith(2, {
    type: 'thinking',
    on: true,
  });
  await events.handle({ type: 'settled' });
  expect(renderer.emit).toHaveBeenLastCalledWith({
    type: 'thinking',
    on: false,
  });
  await events.handle({ type: 'direct', from, amount: 5 });
  expect(renderer.emit).toHaveBeenLastCalledWith({
    type: 'absorb',
    from,
    amount: 5,
  });
  vi.mocked(renderer.emit).mockClear();
  const delivery = events.handle({
    type: 'committed',
    nodes: ['todo', 'idea'],
  });
  expect(renderer.emit).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(219);
  expect(renderer.emit).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await delivery;
  expect(renderer.emit).toHaveBeenLastCalledWith({ type: 'land', at: 'idea' });
  expect(refresh).toHaveBeenCalledTimes(1);
  events.destroy();
});
it('runs every branch and warm pulse only while eligible', () => {
  vi.useFakeTimers();
  const { renderer } = mockRenderer();
  const c = new SceneController(renderer, {
    intro: 'never',
    motion: 'full',
    date: 'x',
    storage: localStorage,
    change: vi.fn(),
  });
  c.start();
  c.setOverdue(true);
  c.setActive(true);
  vi.advanceTimersByTime(2801);
  for (const to of ['material', 'todo', 'tip', 'skill', 'prompt'])
    expect(renderer.emit).toHaveBeenCalledWith({
      type: 'orb',
      to,
      strength: 'ambient',
    });
  expect(renderer.emit).toHaveBeenCalledWith({
    type: 'pulse',
    at: 'todo',
    tone: 'warm',
  });
  vi.mocked(renderer.emit).mockClear();
  c.setMotion('off');
  vi.advanceTimersByTime(10000);
  expect(renderer.emit).not.toHaveBeenCalled();
  c.destroy();
});
it('does not expose a second commit while its orb is still in flight', async () => {
  const { renderer } = mockRenderer(),
    refresh = vi.fn(),
    arrivals: (() => void)[] = [];
  vi.mocked(renderer.emit).mockImplementation(
    () => new Promise<void>((r) => arrivals.push(r)),
  );
  const events = new HomeEvents(renderer, refresh);
  events.setActive(true);
  await events.handle({ type: 'saving', nodes: ['todo'] });
  const first = events.handle({ type: 'committed', nodes: ['todo'] });
  await events.handle({ type: 'saving', nodes: ['todo'] });
  const second = events.handle({ type: 'committed', nodes: ['todo'] });
  arrivals[0]!();
  await first;
  expect(refresh).not.toHaveBeenCalled();
  arrivals[1]!();
  await second;
  expect(refresh).toHaveBeenCalledTimes(1);
  events.destroy();
});
it('off refreshes immediately without orbs or stagger and later deletions are not deduplicated', async () => {
  const { renderer } = mockRenderer(),
    refresh = vi.fn(),
    delay = vi.fn(async () => {});
  const events = new HomeEvents(renderer, refresh, () => 100, delay);
  events.setActive(true);
  events.setMotion('off');
  await events.handle({ type: 'committed', nodes: ['todo', 'idea'] });
  expect(renderer.emit).not.toHaveBeenCalled();
  expect(delay).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
  events.setActive(false);
  await events.handle({ type: 'data', entity: 'idea', op: 'delete' });
  events.setActive(true);
  expect(refresh).toHaveBeenCalledTimes(2);
  events.destroy();
});

it('undoing an idea emits a reverse orb rather than a second forward landing', async () => {
  const { renderer } = mockRenderer();
  const events = new HomeEvents(renderer, vi.fn());
  events.setActive(true);
  await events.handle({ type: 'undone', nodes: ['idea'] });
  expect(renderer.emit).toHaveBeenLastCalledWith({
    type: 'orb',
    to: 'idea',
    strength: 'event',
    reverse: true,
  });
  events.destroy();
});
