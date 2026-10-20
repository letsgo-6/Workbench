import { zh } from './zh-CN';
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
export type TextKey = Paths<typeof zh>;
export function t(
  key: TextKey,
  params: Record<string, string | number> = {},
): string {
  let value: unknown = zh;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }
  return String(value).replace(/\{(\w+)\}/g, (match, name: string) =>
    String(params[name] ?? match),
  );
}
