const variable = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
export function variables(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(variable)]
        .map((m) => m[1]?.trim() ?? '')
        .filter(Boolean),
    ),
  ];
}
export function renderTemplate(
  body: string,
  values: Readonly<Record<string, string | undefined>>,
): string {
  return body.replace(
    variable,
    (match: string, name: string) => values[name.trim()] || match,
  );
}
