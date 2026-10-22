import type { NodeId } from './types';
export type HomeEvent =
  | { type: 'analyzing'; from: DOMRect; amount: number }
  | { type: 'settled' }
  | { type: 'preview'; nodes: NodeId[] }
  | { type: 'highlight'; node: NodeId | null }
  | {
      type: 'saving' | 'committed' | 'undoing' | 'undone' | 'released';
      nodes: NodeId[];
    }
  | { type: 'direct'; from: DOMRect; amount: number }
  | { type: 'data'; entity: string; op: string }
  | { type: 'replay' };
const listeners = new Set<(event: HomeEvent) => void>();
export const homeBus = {
  emit(event: HomeEvent) {
    listeners.forEach((cb) => cb(event));
  },
  on(cb: (e: HomeEvent) => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  get active() {
    return listeners.size > 0;
  },
};
