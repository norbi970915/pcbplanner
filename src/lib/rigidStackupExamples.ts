import { RIGID_EXAMPLE_ASSUMPTIONS as A, RIGID_EXAMPLE_OPTIONS, RIGID_ROLE_PATTERNS } from '../data/rigidStackupRules';
import type { Layer, Stackup } from './stackups';

/** Original, reproducible planning examples: distribute a thickness budget, never look up a vendor build.
 * Thickness excludes mask. No glass style, resin content, measured material or process capability is implied.
 */
export function createRigidExamples(): Stackup[] {
  return RIGID_EXAMPLE_OPTIONS.flatMap(({ layers: n, thicknesses }) => thicknesses.flatMap(thickness => {
    const budget = thickness - 2 * A.outerCopper - (n - 2) * A.innerCopper;
    const profiles = n === 2 ? ['equal'] as const : ['equal', 'close'] as const;
    return profiles.map(profile => {
      const id = 'pcbplanner-v1-' + n + 'l-' + Math.round(thickness * 1000) + '-' + profile;
      const gapCount = n - 1;
      // Either equal gaps, or 0.10 mm outer gaps with the remainder shared by the inner gaps.
      const gap = (i: number) => profile === 'equal' ? budget / gapCount
        : i === 0 || i === gapCount - 1 ? A.closeOuterGap : (budget - 2 * A.closeOuterGap) / (gapCount - 2);
      const label = n === 2 ? 'Single core example' : profile === 'equal' ? 'Equal dielectric gaps' : 'Close outer planes · 0.10 mm';
      const mask = (side: string): Layer => ({ id: id + '-mask-' + side, kind: 'mask', name: side + ' solder mask',
        t: A.maskThickness, er: A.maskDk, df: A.maskDf, material: 'Assumed solder mask' });
      const layers: Layer[] = [mask('Top')];
      for (let i = 0; i < n; i++) {
        layers.push({ id: id + '-cu-' + (i + 1), kind: 'copper', name: 'L' + (i + 1),
          t: i === 0 || i === n - 1 ? A.outerCopper : A.innerCopper,
          role: RIGID_ROLE_PATTERNS[n][i] === 'P' ? 'plane' : 'signal' });
        if (i < gapCount) layers.push({ id: id + '-gap-' + (i + 1), kind: 'dielectric',
          name: (n === 2 || i % 2 === 1 ? 'Core' : 'Prepreg') + ' gap ' + (i + 1),
          t: gap(i), er: A.dielectricDk, df: A.dielectricDf, material: 'Assumed FR-4' });
      }
      layers.push(mask('Bottom'));
      return { id, name: 'PCBPlanner example · ' + n + 'L ' + thickness + ' mm · ' + label,
        label, layers, nominal: thickness, construction: 'rigid' as const, builtin: true,
        origin: 'pcbplanner-example-v1' as const,
        note: 'Original PCBPlanner planning example. Thicknesses and Dk/Df are assumptions, not a fabricator-approved construction. Confirm materials, pressed gaps, copper and tolerances with your fabricator.' };
    });
  }));
}
