import type { HomeEvent } from './bus';
import type { MotionLevel, NeuronRenderer, NodeId } from './types';
import { nodeIds } from './layout';
export class HomeEvents {
  private held = new Set<NodeId>();
  private recent = new Map<NodeId, number>();
  private queued = new Set<NodeId>();
  private active = false;
  private dirty = false;
  private motion: MotionLevel = 'full';
  private inFlight = 0;
  private disposed = false;
  constructor(
    private renderer: NeuronRenderer,
    private refresh: () => void,
    private now = () => Date.now(),
    private delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  setActive(active: boolean) {
    this.active = active;
    if (active && this.queued.size) {
      const nodes = [...this.queued];
      this.queued.clear();
      nodes.forEach((n) => this.held.add(n));
      void this.deliver(nodes, false);
    } else if (active && this.dirty && !this.held.size && !this.inFlight) {
      this.dirty = false;
      this.refresh();
    }
  }
  setMotion(motion: MotionLevel) {
    this.motion = motion;
  }
  async handle(e: HomeEvent) {
    if (this.disposed) return;
    if (e.type === 'analyzing') {
      void this.renderer.emit({
        type: 'absorb',
        from: e.from,
        amount: e.amount,
      });
      void this.renderer.emit({ type: 'thinking', on: true });
    }
    if (e.type === 'settled')
      void this.renderer.emit({ type: 'thinking', on: false });
    if (e.type === 'direct')
      void this.renderer.emit({
        type: 'absorb',
        from: e.from,
        amount: e.amount,
      });
    if (e.type === 'released') {
      this.release(e.nodes);
      if (this.active && !this.held.size && !this.inFlight) this.refresh();
    }
    if (e.type === 'saving' || e.type === 'undoing')
      e.nodes.forEach((n) => this.held.add(n));
    if (e.type === 'committed' || e.type === 'undone')
      await this.deliver(e.nodes, e.type === 'undone');
    if (e.type === 'data') {
      if (!nodeIds.includes(e.entity as NodeId)) {
        if (this.held.size || this.inFlight) {
          this.dirty = true;
          return;
        }
        if (
          e.entity === 'all' &&
          e.op === 'create' &&
          [...this.recent.values()].some((t) => this.now() - t < 1500)
        )
          return;
        if (this.active) this.refresh();
        else this.dirty = true;
        return;
      }
      if (this.held.size || this.inFlight) {
        this.dirty = true;
        const node = e.entity as NodeId;
        if (
          (e.op === 'create' || e.op === 'import') &&
          !this.held.has(node) &&
          this.now() - (this.recent.get(node) ?? -Infinity) >= 1500
        )
          this.queued.add(node);
        return;
      }
      const nodes = [e.entity as NodeId];
      let refresh = false;
      for (const n of nodes) {
        if (
          this.held.has(n) ||
          ((e.op === 'create' || e.op === 'import') &&
            this.now() - (this.recent.get(n) ?? -Infinity) < 1500)
        )
          continue;
        if (!this.active) {
          this.dirty = true;
          if (e.op === 'create' || e.op === 'import') this.queued.add(n);
          continue;
        }
        if (e.op === 'create' || e.op === 'import') {
          this.held.add(n);
          await this.deliver([n], false);
          return;
        }
        refresh = true;
      }
      if (refresh && !this.disposed) this.refresh();
    }
  }
  private async deliver(nodes: NodeId[], reverse: boolean) {
    this.inFlight++;
    await Promise.all(
      nodes.map(async (n, i) => {
        if (i && this.motion !== 'off') await this.delay(i * 220);
        if (this.disposed) return;
        this.recent.set(n, this.now());
        if (this.active && this.motion !== 'off')
          await this.renderer.emit(
            n === 'idea' && !reverse
              ? { type: 'land', at: n }
              : { type: 'orb', to: n, strength: 'event', reverse },
          );
        else if (!this.active) this.queued.add(n);
        this.held.delete(n);
        this.recent.set(n, this.now());
      }),
    );
    this.inFlight--;
    if (!this.disposed && this.active && !this.held.size && !this.inFlight) {
      if (this.queued.size) {
        this.setActive(true);
        return;
      }
      this.dirty = false;
      this.refresh();
    }
  }
  release(nodes: NodeId[]) {
    nodes.forEach((n) => this.held.delete(n));
  }
  destroy() {
    this.disposed = true;
  }
}
