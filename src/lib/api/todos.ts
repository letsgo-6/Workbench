import { createContentApi } from './client';
import type { Todo } from '@/types/bindings/Todo';
export const todosApi = createContentApi<Todo>('todo');
