import type { EntityType } from '@/types/bindings/EntityType';
import { TARGETS } from '../targets';
type Token = { value: string; string: boolean; complete: boolean };
// Read strings as units so braces/keys inside source text cannot become fake items.
function tokens(raw: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char !== '"') {
      if ('{}[]:,'.includes(char))
        out.push({ value: char, string: false, complete: true });
      continue;
    }
    let value = '';
    let complete = false;
    for (i++; i < raw.length; i++) {
      const next = raw[i]!;
      if (next === '"') {
        complete = true;
        break;
      }
      if (next !== '\\') {
        value += next;
        continue;
      }
      const escape = raw[++i];
      if (!escape) break;
      if (escape === 'u') {
        const hex = raw.slice(i + 1, i + 5);
        if (!/^[\da-f]{4}$/i.test(hex)) {
          i = raw.length;
          break;
        }
        value += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        const escaped: Record<string, string> = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (!(escape in escaped)) {
          i = raw.length;
          break;
        }
        value += escaped[escape];
      }
    }
    out.push({ value, string: true, complete });
    if (!complete) break;
  }
  return out;
}
/** Presentation only. Rust still validates the complete result before any preview/save. */
export function partialItems(
  raw: string,
): { kind: EntityType; title: string }[] {
  const list = tokens(raw);
  const rows: { kind?: EntityType; title?: string }[] = [];
  let depth = 0;
  let itemsDepth = -1;
  let rowDepth = -1;
  let row: (typeof rows)[number] | null = null;
  for (let i = 0; i < list.length; i++) {
    const token = list[i]!;
    if (!token.string) {
      if (token.value === '{' || token.value === '[') {
        depth++;
        if (token.value === '{' && depth === itemsDepth + 1 && itemsDepth > 0) {
          row = {};
          rows.push(row);
          rowDepth = depth;
        }
      } else if (token.value === '}' || token.value === ']') {
        if (depth === rowDepth) {
          row = null;
          rowDepth = -1;
        }
        if (depth === itemsDepth) itemsDepth = -1;
        depth--;
      }
      continue;
    }
    const colon = list[i + 1];
    const value = list[i + 2];
    if (!token.complete || colon?.string || colon?.value !== ':' || !value)
      continue;
    if (
      depth === 1 &&
      token.value === 'items' &&
      !value.string &&
      value.value === '['
    )
      itemsDepth = depth + 1;
    if (!row || depth !== rowDepth || !value.string) continue;
    if (
      token.value === 'type' &&
      value.complete &&
      TARGETS.some((t) => t.kind === value.value)
    )
      row.kind = value.value as EntityType;
    if (token.value === 'title') row.title = value.value;
  }
  return rows.flatMap((row) =>
    row.kind && row.title ? [{ kind: row.kind, title: row.title }] : [],
  );
}
