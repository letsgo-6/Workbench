import type { EntityType } from '@/types/bindings/EntityType';
import type { Entry, createContentApi } from './client';
export type { Entry, EntryInput } from './client';
import { ideasApi } from './ideas';
import { todosApi } from './todos';
import { tipsApi } from './tips';
import { skillsApi } from './skills';
import { promptsApi } from './prompts';
export const kinds: EntityType[] = ['idea', 'todo', 'tip', 'skill', 'prompt'];
export const routes: Record<EntityType, string> = {
  idea: 'ideas',
  todo: 'todos',
  tip: 'tips',
  skill: 'skills',
  prompt: 'prompts',
};
const apis = {
  idea: ideasApi,
  todo: todosApi,
  tip: tipsApi,
  skill: skillsApi,
  prompt: promptsApi,
};
export function contentApi(
  kind: EntityType,
): ReturnType<typeof createContentApi<Entry>> {
  return apis[kind];
}
export function titleOf(item: Entry): string {
  return 'name' in item
    ? item.name
    : 'title' in item
      ? item.title
      : (item.contentMd.split('\n')[0]?.replace(/^#+\s*/, '') ?? '');
}
export function bodyOf(item: Entry): string {
  return 'body' in item
    ? item.body
    : 'noteMd' in item
      ? item.noteMd
      : (item.contentMd ?? '');
}
