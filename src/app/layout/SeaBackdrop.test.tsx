import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { SeaBackdrop } from './SeaBackdrop';
const visibility = vi.hoisted(() => ({ visible: true }));
vi.mock('@/features/home/useSceneVisibility', () => ({
  useSceneVisibility: () => visibility.visible,
}));
afterEach(() => {
  cleanup();
  visibility.visible = true;
  vi.restoreAllMocks();
});
it('keeps a poster when motion is off and never allocates a video decoder', () => {
  const { container } = render(<SeaBackdrop motion="off" />);
  expect(container.querySelector('video')).toBeNull();
  expect(container.querySelector('img')?.src).toContain('wake-up-poster.jpg');
  expect(container.firstElementChild?.getAttribute('data-state')).toBe(
    'poster',
  );
});
it('uses a static frame for system reduced motion even if full motion was selected', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  const { container } = render(<SeaBackdrop motion="full" />);
  expect(container.querySelector('video')).toBeNull();
  expect(container.firstElementChild?.getAttribute('data-state')).toBe(
    'poster',
  );
});
it('pauses when hidden, resumes in lite mode, and retains one video across rerenders', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {});
  const { container, rerender } = render(<SeaBackdrop motion="full" />);
  const element = container.querySelector('video')!;
  fireEvent.loadedData(element);
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  visibility.visible = false;
  rerender(<SeaBackdrop motion="full" />);
  expect(pause).toHaveBeenCalled();
  visibility.visible = true;
  rerender(<SeaBackdrop motion="lite" />);
  expect(element.playbackRate).toBe(0.65);
  expect(container.querySelector('video')).toBe(element);
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
});
it('uses the poster on media failure or rejected autoplay without removing app content', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
    new Error('decode'),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const { container } = render(<SeaBackdrop motion="full" />);
  fireEvent.loadedData(container.querySelector('video')!);
  await waitFor(() => expect(container.querySelector('video')).toBeNull());
  expect(container.firstElementChild?.getAttribute('data-state')).toBe(
    'poster',
  );
});
