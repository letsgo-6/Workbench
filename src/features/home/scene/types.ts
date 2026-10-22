export type NodeId = 'idea' | 'material' | 'todo' | 'tip' | 'skill' | 'prompt';
export type ScenePhase = 'forming' | 'dormant' | 'growing' | 'awake';
export type MotionLevel = 'full' | 'lite' | 'off';
export interface NodeBox {
  x: number;
  y: number;
  r: number;
}
export interface SceneLayout {
  width: number;
  height: number;
  dpr: number;
  nodes: Record<NodeId, NodeBox>;
}
export interface NodeVisual {
  hover: boolean;
  focus: boolean;
  pending: boolean;
  dropTarget: boolean;
  activity: number;
  overdue: boolean;
}
export interface SceneTheme {
  primary: string;
  foreground: string;
  background: string;
  warning: string;
  muted: string;
  dark: boolean;
}
export type SceneEvent =
  | { type: 'absorb'; from: DOMRect; amount: number }
  | { type: 'thinking'; on: boolean }
  | {
      type: 'orb';
      to: NodeId;
      strength: 'ambient' | 'event';
      reverse?: boolean;
    }
  | { type: 'land'; at: NodeId }
  | { type: 'pulse'; at: NodeId; tone: 'normal' | 'warm' };
export type RendererSignal =
  { type: 'formed' } | { type: 'born'; node: NodeId } | { type: 'awake' };
export interface NeuronRenderer {
  mount(host: HTMLElement): Promise<void>;
  resize(layout: SceneLayout, opts?: { animate?: boolean }): void;
  setPhase(phase: ScenePhase, opts?: { instant?: boolean }): void;
  setNodes(nodes: Record<NodeId, NodeVisual>): void;
  setTheme(theme: SceneTheme): void;
  setMotion(level: MotionLevel): void;
  emit(event: SceneEvent): Promise<void>;
  zoom(node: NodeId, dir: 'in' | 'out'): Promise<void>;
  onSignal(cb: (s: RendererSignal) => void): () => void;
  pause(): void;
  resume(): void;
  destroy(): void;
}
