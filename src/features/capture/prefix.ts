import type { EntityType } from '@/types/bindings/EntityType';
// Keep in sync with services/capture/prefix.rs (including the required delimiter).
const prefixes: [EntityType, string[]][] = [
  ['idea', ['灵感', '想法']],
  ['todo', ['待办', '任务', 'todo']],
  ['tip', ['技巧', 'tip']],
  ['skill', ['skill']],
  ['prompt', ['提示词', 'prompt']],
  ['material', ['作品', '素材', '组件']],
];
export function detectTarget(text: string): EntityType | null {
  const start = text.trimStart().toLowerCase();
  for (const [kind, names] of prefixes)
    if (
      names.some(
        (name) =>
          start.startsWith(name) && /^[：:\s]/u.test(start.slice(name.length)),
      )
    )
      return kind;
  return null;
}
