import { createContentApi } from './client';
import type { Prompt } from '@/types/bindings/Prompt';
export const promptsApi = createContentApi<Prompt>('prompt');
