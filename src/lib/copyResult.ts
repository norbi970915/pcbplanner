export function formatCopiedResult(label: string, value: string, unit: string): string {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
  const suffix = clean(unit);
  return `${clean(label)}: ${clean(value)}${suffix ? ` ${suffix}` : ''}`;
}
