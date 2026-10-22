import type { ItemResult } from './kicadRouting';

/** Suggestions explain existing findings; they never alter a board or introduce new design limits. */
export function routingReviewSteps(res: ItemResult): string[] {
  const steps: string[] = [];
  for (const layer of res.layers.filter(l => l.status === 'fail' || l.status === 'warn')) {
    if (layer.solve.noRef) steps.push(`Confirm the reference-plane role and saved copper on ${layer.layer} before judging its impedance.`);
    else if (layer.solve.z !== undefined) steps.push(`Review the routed width${layer.gap === undefined ? '' : ' and pair gap'} on ${layer.layer}. Use that layer's cross-section in Impedance to find geometry for the selected target.`);
    else steps.push(`Review the geometry and reference planes on ${layer.layer}; resolve its calculation note before choosing a new width.`);
    if (layer.points?.length) steps.push(`Inspect the highlighted reference-plane gaps on ${layer.layer}; restore a continuous return path or reroute the trace.`);
  }
  if (res.skew && ['fail', 'warn'].includes(res.skew.status)) steps.push('Compare the two routed lengths and tune the shorter trace in KiCad. Include package and via delay in the final link budget.');
  if (res.length?.status === 'warn') steps.push('Review the route length against the displayed interface guideline and shorten the route where practical.');
  if (res.loss && ['fail', 'warn'].includes(res.loss.status)) steps.push('Review the frequency, laminate, copper roughness and route length in Trace Loss before changing the channel.');
  for (const check of (res.checks ?? []).filter(c => c.status === 'fail' || c.status === 'warn')) {
    const action = {
      stub: 'Review the marked via stubs; discuss back-drilling or a different via span with your fabricator.',
      return: 'Inspect the marked layer changes and add a nearby return via where the reference plane changes.',
      vias: 'Review the via counts on both traces against the displayed interface guideline.',
      space: 'Increase separation from the highlighted neighbouring signal copper where the guideline is exceeded.',
      lane: 'Review matching between lanes of the same link, using the displayed length or delay guideline.',
    }[check.key];
    if (action) steps.push(action);
  }
  if (!steps.length) steps.push('Review the listed notes and confirm the imported stackup and selected target against your actual board requirements.');
  return [...new Set(steps)];
}
