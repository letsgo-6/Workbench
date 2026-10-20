export function highlight(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return [{ text, hit: false }];
  const re = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      hit: words.some((word) => word.toLowerCase() === part.toLowerCase()),
    }));
}
