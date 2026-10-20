import { describe, it, expect } from 'vitest';
import cases from '../../tests/fixtures/template_cases.json';
import { variables, renderTemplate } from './template';
import { highlight } from './highlight';
import { localDate, dayLabel } from './date';
describe('shared Rust / TS template contract', () => {
  for (const [i, test] of cases.entries())
    it(`fixture ${i}`, () => {
      expect(variables(test.body)).toEqual(test.variables);
      expect(renderTemplate(test.body, test.values)).toBe(test.result);
    });
});
it('highlights literal short Chinese and escapes regex syntax', () => {
  expect(
    highlight('学习统计，统计学习', '统计').filter((p) => p.hit),
  ).toHaveLength(2);
  expect(highlight('a+b and c', 'a+b').filter((p) => p.hit)).toEqual([
    { text: 'a+b', hit: true },
  ]);
});
it('uses local calendar dates over month boundaries', () => {
  const date = new Date(2026, 2, 1, 12);
  expect(localDate(date)).toBe('2026-03-01');
  expect(dayLabel('2026-02-28', date)).toBe('昨天');
  expect(dayLabel('2026-03-01', date)).toBe('今天');
});
