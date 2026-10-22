import { Channel, invoke } from '@tauri-apps/api/core';
import { AppError, ipc } from '../ipc';
import type { CaptureStreamEvent } from '@/types/bindings/CaptureStreamEvent';
import type { CaptureAnalyzeInput } from '@/types/bindings/CaptureAnalyzeInput';
import type { CapturePreview } from '@/types/bindings/CapturePreview';
import type { CaptureCommitInput } from '@/types/bindings/CaptureCommitInput';
import type { CaptureCommitResult } from '@/types/bindings/CaptureCommitResult';
import type { CaptureUndoInput } from '@/types/bindings/CaptureUndoInput';
import type { CaptureUndoResult } from '@/types/bindings/CaptureUndoResult';
export const captureApi = {
  analyze: (input: CaptureAnalyzeInput) =>
    ipc<CapturePreview>('capture_analyze', input),
  /** v0.5: same contract as `analyze`, plus stage/delta events for the process panel. */
  analyzeStream: async (
    input: CaptureAnalyzeInput,
    onEvent: Channel<CaptureStreamEvent>,
  ) => {
    try {
      return await invoke<CapturePreview>('capture_analyze_stream', {
        input,
        onEvent,
      });
    } catch (error) {
      throw new AppError(error);
    }
  },
  commit: (input: CaptureCommitInput) =>
    ipc<CaptureCommitResult>('capture_commit', input),
  undo: (input: CaptureUndoInput) =>
    ipc<CaptureUndoResult>('capture_undo', input),
};
export { Channel };
