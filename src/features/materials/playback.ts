export interface Player {
  play: () => Promise<void> | void;
  pause: () => void;
}
interface Candidate {
  player: Player;
  eligible: boolean;
  distance: number;
}
export class PlaybackPool {
  private entries = new Map<string, Candidate>();
  private active = new Set<string>();
  private manual = new Set<string>();
  reserve(id: string, playing: boolean) {
    if (playing) this.manual.add(id);
    else this.manual.delete(id);
    this.reconcile();
  }
  update(id: string, value: Candidate) {
    this.entries.set(id, value);
    this.reconcile();
  }
  remove(id: string) {
    this.entries.get(id)?.player.pause();
    this.entries.delete(id);
    this.active.delete(id);
    this.reconcile();
  }
  private reconcile() {
    const next = new Set(
      [...this.entries]
        .filter(([, v]) => v.eligible)
        .sort((a, b) => a[1].distance - b[1].distance)
        .slice(0, Math.max(0, 4 - this.manual.size))
        .map(([id]) => id),
    );
    for (const id of this.active)
      if (!next.has(id)) this.entries.get(id)?.player.pause();
    for (const id of next)
      if (!this.active.has(id)) {
        const result = this.entries.get(id)?.player.play();
        if (result) void result.catch(() => {});
      }
    this.active = next;
  }
}
export const previewPool = new PlaybackPool();
