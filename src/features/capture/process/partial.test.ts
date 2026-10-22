import { expect, it } from 'vitest';
import { partialItems } from './partial';
it.each([
  ['', []],
  [
    '{"items":[{"type":"tip","title":"压缩上',
    [{ kind: 'tip', title: '压缩上' }],
  ],
  [
    '{"items":[{"type":"skill","title":"名字\\',
    [{ kind: 'skill', title: '名字' }],
  ],
  [
    '{"items":[{"type":"prompt","title":"a\\"b\\n\\u4e2d\\u4',
    [{ kind: 'prompt', title: 'a"b\n中' }],
  ],
  [
    '{"items":[{"title":"先有标题","type":"todo"}',
    [{ kind: 'todo', title: '先有标题' }],
  ],
  ['{"items":[{"type":"unknown","title":"不猜类型"}', []],
  ['{"items":[{"type":"ski', []],
  ['{"items":[{"source":"\\"type\\":\\"todo\\",\\"title\\":\\"伪造\\""}', []],
  [
    '{"items":[{"type":"skill","extra":{"title":"嵌套忽略"},"title":"真的"}',
    [{ kind: 'skill', title: '真的' }],
  ],
  [
    '```json\n{"items":[{"type":"idea","title":"甲"},{"type":"material","title":"乙"}]}\n```',
    [
      { kind: 'idea', title: '甲' },
      { kind: 'material', title: '乙' },
    ],
  ],
])('reads incomplete JSON without inventing values: %s', (raw, expected) => {
  expect(partialItems(raw)).toEqual(expected);
});
