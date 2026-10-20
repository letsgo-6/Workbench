import { ipc } from '../ipc';
import type { EntityType } from '@/types/bindings/EntityType';
import type { Page } from '@/types/bindings/Page';
import type { ListQuery } from '@/types/bindings/ListQuery';
import type { Idea } from '@/types/bindings/Idea';
import type { Todo } from '@/types/bindings/Todo';
import type { Tip } from '@/types/bindings/Tip';
import type { Skill } from '@/types/bindings/Skill';
import type { Prompt } from '@/types/bindings/Prompt';
import type { IdeaInput } from '@/types/bindings/IdeaInput';
import type { TodoInput } from '@/types/bindings/TodoInput';
import type { TipInput } from '@/types/bindings/TipInput';
import type { SkillInput } from '@/types/bindings/SkillInput';
import type { PromptInput } from '@/types/bindings/PromptInput';
export type Entry = Idea | Todo | Tip | Skill | Prompt;
export type EntryInput =
  IdeaInput | TodoInput | TipInput | SkillInput | PromptInput;
export function createContentApi<T extends Entry>(kind: EntityType) {
  return {
    list: (input: Partial<ListQuery>) =>
      ipc<Page<T>>(`${kind}_list`, { offset: 0, ...input }),
    get: (id: string) => ipc<T>(`${kind}_get`, { id }),
    create: (input: EntryInput) => ipc<T>(`${kind}_create`, input),
    update: (id: string, input: EntryInput) =>
      ipc<T>(`${kind}_update`, { id, ...input }),
    star: (id: string, starred: boolean) =>
      ipc<T>(`${kind}_set_starred`, { id, starred }),
    delete: (id: string) => ipc<void>(`${kind}_delete`, { id }),
  };
}
