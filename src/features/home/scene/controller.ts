import type { MotionLevel, NeuronRenderer, NodeId, ScenePhase } from './types';
import { nodeIds } from './layout';
export interface SceneState {
  phase: ScenePhase;
  born: NodeId[];
}
export class SceneController {
  state: SceneState = { phase: 'forming', born: ['idea'] };
  private stop: () => void;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private overdue = false;
  private active = false;
  private motion: MotionLevel;
  constructor(
    readonly renderer: NeuronRenderer,
    private options: {
      motion: MotionLevel;
      intro: string;
      date: string;
      storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
      change: (s: SceneState) => void;
    },
  ) {
    this.motion = options.motion;
    this.stop = renderer.onSignal((signal) => {
      if (signal.type === 'formed' && this.state.phase === 'forming')
        this.phase('dormant');
      if (signal.type === 'born')
        this.update({
          ...this.state,
          born: [...new Set([...this.state.born, signal.node])],
        });
      if (signal.type === 'awake') this.awake();
    });
  }
  start() {
    const o = this.options;
    if (
      this.motion === 'off' ||
      o.intro === 'never' ||
      (o.intro === 'daily' && o.storage.getItem('wb.home.introDate') === o.date)
    ) {
      this.phase('awake', true);
      this.awake();
    } else this.phase('forming');
  }
  replay() {
    this.options.storage.removeItem('wb.home.introDate');
    this.update({ phase: 'forming', born: ['idea'] });
    this.phase(
      this.motion === 'off' ? 'awake' : 'forming',
      this.motion === 'off',
    );
  }
  wake() {
    if (this.state.phase === 'forming' || this.state.phase === 'dormant') {
      this.phase(
        this.motion === 'lite' ? 'awake' : 'growing',
        this.motion === 'lite',
      );
      if (this.motion === 'lite') this.awake();
    }
  }
  private phase(phase: ScenePhase, instant = false) {
    this.update({ phase, born: phase === 'awake' ? [...nodeIds] : ['idea'] });
    this.renderer.setPhase(phase, { instant });
  }
  private awake() {
    this.update({ phase: 'awake', born: [...nodeIds] });
    this.options.storage.setItem('wb.home.introDate', this.options.date);
    this.schedule();
  }
  private update(s: SceneState) {
    this.state = s;
    this.options.change(s);
  }
  setMotion(motion: MotionLevel) {
    this.motion = motion;
    this.renderer.setMotion(motion);
    this.schedule();
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.renderer.resume();
    else this.renderer.pause();
    this.schedule();
  }
  setOverdue(value: boolean) {
    if (this.overdue !== value) {
      this.overdue = value;
      this.schedule();
    }
  }
  private schedule() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if (!this.active || this.state.phase !== 'awake') return;
    const ambient = (to: NodeId) => {
      const timer = setTimeout(
        () => {
          this.timers.delete(timer);
          void this.renderer.emit({ type: 'orb', to, strength: 'ambient' });
          ambient(to);
        },
        1500 + Math.random() * 1200,
      );
      this.timers.add(timer);
    };
    if (this.motion === 'full') nodeIds.slice(1).forEach(ambient);
    const warm = () => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void this.renderer.emit({ type: 'pulse', at: 'todo', tone: 'warm' });
        warm();
      }, 2800);
      this.timers.add(timer);
    };
    if (this.overdue && this.motion !== 'off') warm();
  }
  destroy() {
    this.timers.forEach(clearTimeout);
    this.stop();
    this.renderer.destroy();
  }
}
