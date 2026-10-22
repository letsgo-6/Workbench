import { expect, it } from 'vitest';
import { detectTarget } from './prefix';
it.each([
  ['灵感：想法', 'idea'],
  ['想法: 正文', 'idea'],
  ['  待办：整理', 'todo'],
  ['任务 整理', 'todo'],
  ['ToDo: 整理', 'todo'],
  ['技巧：/compact', 'tip'],
  ['TIP\t正文', 'tip'],
  ['SKILL：链接', 'skill'],
  ['提示词：你是{{topic}}', 'prompt'],
  ['Prompt: write', 'prompt'],
  ['作品：链接', 'material'],
  ['素材 内容', 'material'],
  ['组件: 提示词', 'material'],
  ['灵感爆发了', null],
  ['skillful', null],
  ['todo', null],
  ['随便说', null],
  ['prompting:', null],
])('recognizes Rust-compatible prefix %s', (text, kind) => {
  expect(detectTarget(text)).toBe(kind);
});
