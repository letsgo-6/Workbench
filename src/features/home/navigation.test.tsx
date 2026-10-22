import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { HomeNavigation, useHomeNavigation } from './navigation';
import type { NeuronRenderer } from './scene/types';
vi.mock('../ideas/IdeaPage', () => ({ IdeaPage: () => null }));
afterEach(() => vi.useRealTimers());
it('queues a quick return pressed during the entry transition', async () => {
  vi.useFakeTimers();
  const renderer: NeuronRenderer = {
    mount: async () => {},
    resize() {},
    setPhase() {},
    setNodes() {},
    setTheme() {},
    setMotion() {},
    emit: async () => {},
    zoom: () => new Promise((r) => setTimeout(r, 600)),
    onSignal: () => () => {},
    pause() {},
    resume() {},
    destroy() {},
  };
  function Probe() {
    const nav = useHomeNavigation(),
      location = useLocation();
    useEffect(() => nav.register(renderer, 'full'), [nav]);
    return (
      <>
        <output>{location.pathname}</output>
        <button onClick={() => nav.enter('idea', 'a')}>enter</button>
        <button onClick={nav.back}>back</button>
      </>
    );
  }
  render(
    <MemoryRouter>
      <HomeNavigation>
        <Probe />
      </HomeNavigation>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('enter'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(501);
  });
  expect(screen.getByRole('status').textContent).toBe('/ideas/a');
  fireEvent.click(screen.getByText('back'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
  expect(screen.getByRole('status').textContent).toBe('/');
});
