import { diffChars, diffWords, diffLines } from 'diff';
export function compare(before: string, after: string, lines = false) {
  if (lines) return diffLines(before, after);
  return typeof Intl.Segmenter === 'function'
    ? diffWords(before, after, {
        intlSegmenter: new Intl.Segmenter('zh', { granularity: 'word' }),
      })
    : diffChars(before, after);
}
