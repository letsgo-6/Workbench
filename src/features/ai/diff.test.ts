import { it, expect } from 'vitest';
import { compare } from './diff';
it('Chinese word comparison and prompt line comparison preserve the full source', () => {
  for (const lines of [false, true]) {
    const result = compare(
      '原文统计分析\n{{topic}}',
      '改进统计分析\n{{topic}}',
      lines,
    );
    expect(
      result
        .filter((p) => !p.added)
        .map((p) => p.value)
        .join(''),
    ).toBe('原文统计分析\n{{topic}}');
    expect(
      result
        .filter((p) => !p.removed)
        .map((p) => p.value)
        .join(''),
    ).toBe('改进统计分析\n{{topic}}');
  }
});
