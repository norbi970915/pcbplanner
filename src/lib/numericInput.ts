/** Parse the whole decimal entry, never a valid prefix of malformed text. */
export function parseNumericInput(text: string): number | null {
  const entry = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(entry)) return null;
  const n = Number(entry);
  return Number.isFinite(n) ? n : null;
}
export function numericInputIssue(text: string, options: {
  min?: number; max?: number; allowZero?: boolean; allowNegative?: boolean;
  integer?: boolean; scale?: number; minimumLabel?: string;
} = {}): string | undefined {
  const n = parseNumericInput(text);
  if (n === null) return text.trim() ? 'Enter a number using a decimal point, for example 0.15 or 1e-3.' : 'Enter a value to calculate.';
  const value = n * (options.scale ?? 1);
  if (!Number.isFinite(value)) return 'This value is too large. Enter a smaller number.';
  if (options.integer && !Number.isInteger(value)) return 'Enter a whole number.';
  const min = options.min ?? 0;
  if (!options.allowNegative && (options.allowZero ? value < min : value <= min)) {
    return 'Enter a value ' + (options.allowZero ? 'of at least ' : 'greater than ') + (options.minimumLabel ?? min) + '.';
  }
  if (options.max !== undefined && value > options.max) return 'Enter a value no greater than ' + options.max + '.';
  return undefined;
}
