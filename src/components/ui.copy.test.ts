import { describe, expect, it } from 'vitest';
import { formatCopiedResult } from '../lib/copyResult';

describe('copied result text', () => {
  it('keeps the label, value and unit in one plain-text line', () => {
    expect(formatCopiedResult('External layer width', '0.74', 'mm')).toBe('External layer width: 0.74 mm');
  });

  it('avoids duplicate spacing when the value already contains its unit', () => {
    expect(formatCopiedResult('DC resistance', '  1.2   mΩ  ', '')).toBe('DC resistance: 1.2 mΩ');
  });
});
