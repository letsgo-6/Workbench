import { Channel, invoke } from '@tauri-apps/api/core';
import { ipc, AppError } from '../ipc';
import type { AiStreamEvent } from '@/types/bindings/AiStreamEvent';
import type { AiActionInput } from '@/types/bindings/AiActionInput';
import type { AiChatInput } from '@/types/bindings/AiChatInput';
import type { ParsedAiResult } from '@/types/bindings/ParsedAiResult';
import type { Prompt } from '@/types/bindings/Prompt';
export { Channel };
async function stream<T>(
  command: string,
  input: AiActionInput | AiChatInput,
  onEvent: Channel<AiStreamEvent>,
) {
  try {
    return await invoke<T>(command, { input, onEvent });
  } catch (error) {
    throw new AppError(error);
  }
}
export const aiApi = {
  action: (input: AiActionInput, ch: Channel<AiStreamEvent>) =>
    stream<void>('ai_run_action', input, ch),
  chat: (input: AiChatInput, ch: Channel<AiStreamEvent>) =>
    stream<string>('ai_chat', input, ch),
  cancel: (id: string) => ipc<void>('ai_cancel', { id }),
  templates: () => ipc<Prompt[]>('ai_template_list'),
  reset: (key: string) => ipc<Prompt>('ai_template_reset', { id: key }),
  parse: (action: string, text: string) =>
    ipc<ParsedAiResult>('ai_parse_result', { action, text }),
};
