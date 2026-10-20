import { invoke } from '@tauri-apps/api/core';
import { t } from '@/i18n';
import type { TextKey } from '@/i18n';
export class AppError extends Error {
  code: string;
  detail?: string;
  constructor(error: unknown) {
    const object = typeof error === 'object' && error !== null ? error : {};
    const code =
      'code' in object && typeof object.code === 'string'
        ? object.code
        : 'INTERNAL';
    const key = `errors.${code}` as TextKey;
    super(t(key));
    this.code = code;
    if (
      'message' in object &&
      typeof object.message === 'string' &&
      code === 'AI_PROVIDER'
    )
      this.detail = object.message;
  }
}
export async function ipc<T>(command: string, input?: unknown): Promise<T> {
  try {
    return await invoke<T>(command, input === undefined ? {} : { input });
  } catch (error) {
    throw new AppError(error);
  }
}
