import { createContentApi } from './client';
import type { Idea } from '@/types/bindings/Idea';
export const ideasApi = createContentApi<Idea>('idea');
