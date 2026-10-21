import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { clearFailedToolState } from './toolRecovery';
import { restoreToolState } from '../state/useUrlState';
import { ErrorBoundary } from '../components/ErrorBoundary';

describe('failed tool recovery', () => {
  it('recovers from corrupt saved inputs after reload without discarding unrelated work', () => {
    const data = new Map([
      ['pcbplanner:tool:/wire-gauge', JSON.stringify({ metal: 'old-unsupported-choice' })],
      ['pcbplanner:comparison:/wire-gauge', 'corrupt baseline'],
      ['pcbplanner:tool:/impedance', 'retained inputs'],
      ['pcbplanner:comparison:/impedance', 'retained comparison'],
      ['pcbtk-stackups', 'retained custom construction'],
      ['pcbtk-favorites', 'retained favorites'],
    ]);
    clearFailedToolState('/wire-gauge', { removeItem: key => { data.delete(key); } });
    expect(restoreToolState('', data.get('pcbplanner:tool:/wire-gauge') ?? null, { metal: 'copper', n: 18 })).toEqual({ metal: 'copper', n: 18 });
    expect(data.has('pcbplanner:comparison:/wire-gauge')).toBe(false);
    expect(data.get('pcbplanner:tool:/impedance')).toBe('retained inputs');
    expect(data.get('pcbplanner:comparison:/impedance')).toBe('retained comparison');
    expect(data.get('pcbtk-stackups')).toBe('retained custom construction');
    expect(data.get('pcbtk-favorites')).toBe('retained favorites');
  });
  it('does not prevent recovery when browser storage is blocked', () => {
    expect(() => clearFailedToolState('/wire-gauge', { removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
  it('the emergency Reset button recovers the next load rather than restoring the same failed state', () => {
    const data = new Map([['pcbplanner:tool:/wire-gauge', '{"metal":"old-unsupported-choice"}']]);
    const defaults = { metal: 'copper' };
    let reloaded: typeof defaults | null = null;
    const reload = vi.fn(() => { reloaded = restoreToolState('', data.get('pcbplanner:tool:/wire-gauge') ?? null, defaults); });
    vi.stubGlobal('window', { sessionStorage: { removeItem: (key: string) => { data.delete(key); } }, location: { pathname: '/wire-gauge', reload }, history: { replaceState: vi.fn() } });
    try {
      const boundary = new ErrorBoundary({ children: null });
      boundary.state = { error: new Error('invalid saved state') };
      const findReset = (node: ReactNode): (() => void) | undefined => {
        for (const child of Children.toArray(node)) {
          if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
          if (child.type === 'button' && child.props.children === 'Reset this tool') return child.props.onClick;
          const reset = findReset(child.props.children); if (reset) return reset;
        }
      };
      const reset = findReset(boundary.render());
      expect(reset).toBeTypeOf('function'); reset!();
      expect(reload).toHaveBeenCalledOnce();
      expect(reloaded).toEqual(defaults);
    } finally { vi.unstubAllGlobals(); }
  });
});
