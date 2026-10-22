import { expect, it } from 'vitest';
import { routingReviewSteps } from './kicadReview';
import type { ItemResult, LayerResult } from './kicadRouting';

it('guides reference-plane and skew findings without prescribing unsupported impedance geometry', () => {
  const layer: LayerResult = { layer: 'F.Cu', len: 10, w: 0.2, wMin: 0.2, wMax: 0.2, solve: { noRef: true }, status: 'warn', reason: 'No reference', tag: 'No reference', points: [{ x: 1, y: 2, note: 'Gap' }] };
  const result: ItemResult = { layers: [layer], len: 10, vias: 0, overall: 'warn', notes: [], skew: { mm: 2, status: 'warn', reason: 'Skew' } };
  const steps = routingReviewSteps(result).join(' ');
  expect(steps).toContain('Confirm the reference-plane role');
  expect(steps).toContain('highlighted reference-plane gaps');
  expect(steps).toContain('tune the shorter trace in KiCad');
  expect(steps).not.toContain('find geometry');
});

it('provides distinct corrections only for reported interface findings', () => {
  const result: ItemResult = { layers: [], len: 20, vias: 4, overall: 'warn', notes: [], checks: [
    { key: 'stub', status: 'warn', reason: 'Long stub' },
    { key: 'return', status: 'warn', reason: 'Distant return' },
    { key: 'space', status: 'ok', reason: 'Enough spacing' },
  ] };
  const steps = routingReviewSteps(result);
  expect(steps.some(s => s.includes('back-drilling'))).toBe(true);
  expect(steps.some(s => s.includes('nearby return via'))).toBe(true);
  expect(steps.some(s => s.includes('Increase separation'))).toBe(false);
});
