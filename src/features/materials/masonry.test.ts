import { describe, it, expect, vi } from 'vitest';
import { masonry } from './masonry';
import { PlaybackPool } from './playback';
import { thumbnailSize } from './thumbnail';
describe('material layout and media budgets', () => {
  it('places by shortest column and preserves all positions when appending or metadata arrives', () => {
    const first = [
      { id: 'a', width: 600, height: 800 },
      { id: 'b', width: 800, height: 400 },
      { id: 'c', width: 800, height: 600 },
    ];
    const before = masonry(first, 800);
    expect(before.columns).toBe(3);
    const after = masonry(
      [
        ...first.map((x) => ({ ...x, height: 1000 })),
        { id: 'd', width: 800, height: 400 },
      ],
      800,
      before,
    );
    expect(after.positions.slice(0, 3)).toEqual(before.positions);
    expect(after.positions[3]?.column).toBe(1);
    expect(masonry([], 0).height).toBe(0);
    expect(
      masonry([{ id: 'x', width: 0, height: 0 }], 0).positions[0]?.height,
    ).toBeGreaterThan(0);
  });
  it('scales thumbnails to 480 while preserving aspect ratio', () => {
    expect(thumbnailSize(1920, 1080)).toEqual({ width: 480, height: 270 });
    expect(thumbnailSize(100, 200)).toEqual({ width: 100, height: 200 });
    expect(() => thumbnailSize(0, 1)).toThrow();
  });
  it('plays at most four eligible previews and prioritizes the viewport center', () => {
    const pool = new PlaybackPool();
    const players = Array.from({ length: 6 }, () => ({
      play: vi.fn(),
      pause: vi.fn(),
    }));
    players.forEach((player, index) =>
      pool.update(String(index), { player, eligible: true, distance: index }),
    );
    expect(players.map((p) => p.play.mock.calls.length)).toEqual([
      1, 1, 1, 1, 0, 0,
    ]);
    pool.update('5', { player: players[5]!, eligible: true, distance: -1 });
    expect(players[3]?.pause).toHaveBeenCalled();
    expect(players[5]?.play).toHaveBeenCalledOnce();
    pool.update('5', { player: players[5]!, eligible: false, distance: 0 });
    expect(players[5]?.pause).toHaveBeenCalled();
    pool.reserve('detail', true);
    expect(players[3]?.pause).toHaveBeenCalled();
    pool.reserve('detail', false);
    expect(players[3]?.play.mock.calls.length).toBeGreaterThan(1);
    for (let i = 0; i < 6; i++) pool.remove(String(i));
  });
});
