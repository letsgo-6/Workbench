import { create } from 'zustand';
import type { EntityType } from '@/types/bindings/EntityType';
import type { CaptureStage } from '@/types/bindings/CaptureStage';
import type { EntityRef } from '@/types/bindings/EntityRef';
/**
 * v0.5: one round of "what the AI did" for the home composer.
 * Memory only — never persisted, never sent back to the model, cleared after the user confirms.
 */
export type ProcessPhase =
  'running' | 'preview' | 'saved' | 'error' | 'cancelled';
export interface ProcessStep {
  stage: CaptureStage | 'saving' | 'saved' | 'failed' | 'cancelled';
  at: number;
  detail?: string;
}
export interface ProcessResult {
  kind: EntityType;
  title: string;
  ref?: EntityRef;
  createdAt: number;
  undone?: boolean;
  hasLink?: boolean;
}
interface ProcessState {
  runId: string | null;
  target: EntityType | null;
  input: string;
  phase: ProcessPhase;
  steps: ProcessStep[];
  /** Raw streamed model output (currently the capture JSON). */
  output: string;
  reasoning: string;
  results: ProcessResult[];
  open: boolean;
  begin: (runId: string, target: EntityType | null, input: string) => void;
  step: (runId: string, step: Omit<ProcessStep, 'at'>) => void;
  delta: (runId: string, text: string) => void;
  reason: (runId: string, text: string) => void;
  finish: (runId: string, phase: ProcessPhase, detail?: string) => void;
  saved: (runId: string, results: ProcessResult[]) => void;
  undone: (runId: string, id: string) => void;
  setOpen: (open: boolean) => void;
  clear: () => void;
}
const empty = {
  runId: null,
  target: null,
  input: '',
  phase: 'running' as ProcessPhase,
  steps: [],
  output: '',
  reasoning: '',
  results: [],
  open: false,
};
export const useCaptureProcess = create<ProcessState>((set, get) => {
  const mine = (runId: string) => get().runId === runId;
  return {
    ...empty,
    // A new round replaces the previous one: there is no cross-round memory by design.
    begin: (runId, target, input) =>
      set({ ...empty, runId, target, input, open: get().open }),
    step: (runId, step) => {
      if (mine(runId))
        set((s) => ({ steps: [...s.steps, { ...step, at: Date.now() }] }));
    },
    delta: (runId, text) => {
      if (mine(runId)) set((s) => ({ output: s.output + text }));
    },
    reason: (runId, text) => {
      if (mine(runId)) set((s) => ({ reasoning: s.reasoning + text }));
    },
    finish: (runId, phase, detail) => {
      if (!mine(runId)) return;
      const stage =
        phase === 'error'
          ? 'failed'
          : phase === 'cancelled'
            ? 'cancelled'
            : null;
      set((s) => ({
        phase,
        steps: stage
          ? [...s.steps, { stage, detail, at: Date.now() }]
          : s.steps,
      }));
    },
    saved: (runId, results) => {
      if (!mine(runId)) return;
      set((s) => ({
        phase: 'saved',
        results,
        steps: [...s.steps, { stage: 'saved', at: Date.now() }],
      }));
    },
    undone: (runId, id) => {
      if (mine(runId))
        set((s) => ({
          results: s.results.map((r) =>
            r.ref?.id === id ? { ...r, undone: true } : r,
          ),
        }));
    },
    setOpen: (open) => set({ open }),
    clear: () => set(empty),
  };
});
