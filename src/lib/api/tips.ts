import { createContentApi } from './client';
import type { Tip } from '@/types/bindings/Tip';
export const tipsApi = createContentApi<Tip>('tip');
