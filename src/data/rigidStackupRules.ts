/** PCBPlanner's v1 example parameters. Designer assumptions, not a fabrication catalogue.
 * Keep v1 geometry stable: a changed rule needs new versioned IDs.
 */
export const RIGID_EXAMPLE_OPTIONS = [
  { layers: 2, thicknesses: [0.8, 1, 1.2, 1.6, 2] },
  { layers: 4, thicknesses: [0.8, 1, 1.2, 1.6, 2] },
  { layers: 6, thicknesses: [1, 1.2, 1.6, 2] },
  { layers: 8, thicknesses: [1.2, 1.6, 2] },
  { layers: 10, thicknesses: [1.6, 2] },
  { layers: 12, thicknesses: [1.6, 2] },
] as const;
export const RIGID_EXAMPLE_COUNT = RIGID_EXAMPLE_OPTIONS.reduce((sum, o) => sum + o.thicknesses.length * (o.layers === 2 ? 1 : 2), 0);
export const DEFAULT_STACKUP_ID = 'pcbplanner-v1-6l-1600-close';
export const RIGID_ROLE_PATTERNS: Record<number, string> = {
  2: 'SP', 4: 'SPPS', 6: 'SPSPPS', 8: 'SPSPPSPS', 10: 'SPSPPSPSPS', 12: 'SPSPSPPSPSPS',
};
export const RIGID_EXAMPLE_ASSUMPTIONS = {
  outerCopper: 0.035, innerCopper: 0.018,
  dielectricDk: 4, dielectricDf: 0.015,
  maskThickness: 0.02, maskDk: 3.5, maskDf: 0.02,
  closeOuterGap: 0.1,
} as const;
