import { expect, it } from 'vitest';
import { kinds } from '@/lib/api/content';
import { item } from './fixtures';
import { convert } from './convert';
it('all five type transitions preserve source, dates, URLs, tags and hidden fields', () => {
  for (const from of kinds)
    for (const to of kinds) {
      const original = item({
        kind: from,
        date: '2026-10-19',
        remindAt: 1000,
        url: 'https://example.com',
        tags: ['Work'],
        skillContent: '---\nname: test\n---',
      });
      const result = convert(original, to, '2026-10-20');
      expect(result.kind).toBe(to);
      expect(result.source).toBe(original.source);
      expect(result.body).toBe(original.source);
      expect(result.tags).toEqual(original.tags);
      expect(result.url).toBe(original.url);
      expect(result.skillContent).toBe(original.skillContent);
      expect(result.dueDate).toBe(original.dueDate);
      expect(result.remindAt).toBe(original.remindAt);
      expect(result.date).toBe(
        from === 'todo' && to === 'idea' ? '2026-10-20' : original.date,
      );
      expect(original.kind).toBe(from);
    }
});
it('empty todo titles use the original first line and respect the character limit', () => {
  const result = convert(
    item({ title: '', source: '文'.repeat(600) + '\n下一行' }),
    'todo',
    '2026-10-20',
  );
  expect(Array.from(result.title)).toHaveLength(500);
});
