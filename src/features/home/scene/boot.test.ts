import { expect, it, vi } from 'vitest';
import { mountRenderer } from './boot';
it('off never loads animation; failed main mount leaves an accessible static fallback and diagnostic', async () => {
  const load = vi.fn().mockRejectedValue(Error('no context')),
    diagnostic = vi.fn();
  const host = document.createElement('div');
  const off = await mountRenderer(host, 'off', load, diagnostic);
  expect(load).not.toHaveBeenCalled();
  off.destroy();
  const fallback = await mountRenderer(host, 'full', load, diagnostic);
  expect(diagnostic).toHaveBeenCalledTimes(1);
  expect(host.querySelector('svg')).not.toBeNull();
  const signal = vi.fn();
  fallback.onSignal(signal);
  fallback.setPhase('forming');
  expect(signal).toHaveBeenCalledWith({ type: 'awake' });
  await expect(
    fallback.emit({ type: 'orb', to: 'todo', strength: 'event' }),
  ).resolves.toBeUndefined();
  fallback.destroy();
  expect(host.children).toHaveLength(0);
});

it('mount rejection destroys the partial renderer before mounting static fallback', async () => {
  const host = document.createElement('div');
  const destroy = vi.fn(() => host.replaceChildren());
  const main = {
    mount: vi.fn(async () => {
      host.append(document.createElement('canvas'));
      throw Error('context unavailable');
    }),
    destroy,
  } as unknown as import('./types').NeuronRenderer;
  const diagnostic = vi.fn();
  const fallback = await mountRenderer(
    host,
    'full',
    async () => main,
    diagnostic,
  );
  expect(destroy).toHaveBeenCalledOnce();
  expect(diagnostic).toHaveBeenCalledOnce();
  expect(host.querySelector('canvas')).toBeNull();
  expect(host.querySelector('svg')).not.toBeNull();
  fallback.destroy();
});
