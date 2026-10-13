// Specs behind each interface page. Kept apart from interfacePages.ts so the route list does not
// pull the full interface data (interfaces.ts) into the main bundle.
import { interfaceById, type InterfaceSpec } from './interfaces';
import type { InterfacePageDef } from './interfacePages';

export const specsOf = (p: InterfacePageDef): InterfaceSpec[] => p.ids.map(interfaceById).filter((s): s is InterfaceSpec => !!s);

/** "100 Ω differential" when every version shares the target, otherwise undefined. */
export function sharedImpedance(p: InterfacePageDef): string | undefined {
  const specs = specsOf(p);
  const z = specs[0].z;
  if (!specs.every((s) => s.z.target === z.target && s.z.kind === z.kind)) return undefined;
  return `${z.target} Ω ${z.kind === 'diff' ? 'differential' : 'single-ended'}`;
}
