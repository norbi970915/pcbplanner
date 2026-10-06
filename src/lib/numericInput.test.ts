import { describe, expect, it } from 'vitest';
import { numericInputIssue, parseNumericInput } from './numericInput';

describe('complete numeric entries', () => {
  it('accepts decimal and scientific forms without accepting a numeric prefix', () => {
    for (const [text, n] of [['.15', .15], ['1.', 1], ['-0.2', -.2], [' 1e-3 ', .001], ['+2E3', 2000]] as const)
      expect(parseNumericInput(text)).toBe(n);
    for (const text of ['', ' ', '-', '.', '1e', '1e-', '0.15mm', '15abc', '1,000', '0x10', 'Infinity', 'NaN', '1e309'])
      expect(parseNumericInput(text)).toBeNull();
  });
  it('checks physical values after unit conversion', () => {
    expect(numericInputIssue('1', { min: .03, scale: .0254 })).toBeDefined();
    expect(numericInputIssue('2', { min: .03, scale: .0254 })).toBeUndefined();
    expect(numericInputIssue('1e308', { scale: 1e9 })).toContain('too large');
  });
  it('respects inclusive limits, zero, signed values and integer counts', () => {
    expect(numericInputIssue('0')).toBeDefined();
    expect(numericInputIssue('0', { allowZero: true })).toBeUndefined();
    expect(numericInputIssue('-40', { allowNegative: true })).toBeUndefined();
    expect(numericInputIssue('1', { min: 1, allowZero: true, integer: true, max: 10000 })).toBeUndefined();
    expect(numericInputIssue('1.5', { integer: true })).toContain('whole');
    expect(numericInputIssue('10001', { max: 10000 })).toContain('10000');
    expect(numericInputIssue('0.9', { min: 1, allowZero: true })).toContain('at least 1');
  });
});
