import { createContentApi } from './client';
import type { Skill } from '@/types/bindings/Skill';
export const skillsApi = createContentApi<Skill>('skill');
