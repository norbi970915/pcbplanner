// Applies an interface's routing rules to a real cross-section: the skew limits
// become trace-length tolerances, the loss budget becomes a maximum route length,
// and the fab limits decide whether the required geometry can be built.
import type { InterfaceSpec } from '../data/interfaces';
import { toSolverGeometry } from './design';
import { djordjevicSarkar, type DielectricSpec } from './dielectric';
import type { Accuracy } from './fieldsolver';
import type { LossRequest } from './solver.worker';
import type { StackupGeometry } from './stackups';
import { C0 } from './units';

/** Material and process settings the loss run needs on top of the stackup. */
export interface LossOptions {
  etch: number; // mm
  df: number; // laminate loss tangent
  f0Hz: number; // frequency the laminate Dk/Df belong to
  maskDf?: number;
  maskF0Hz?: number;
  rqUm: number; // copper RMS roughness
  tempC?: number;
  accuracy: Accuracy;
  fHz: number; // the interface Nyquist frequency
}

/**
 * Loss run for a designed line on a stackup layer. Each ply keeps the Dk of the
 * stackup and takes Df from the chosen laminate, and every Dk is moved to the
 * Nyquist frequency with the wideband Debye model before the field is solved.
 */
export function interfaceLossRequest(sg: StackupGeometry, w: number, s: number | undefined, diff: boolean, o: LossOptions): LossRequest {
  const geom = toSolverGeometry(sg, w, diff, s, o.etch);
  const slabSpecs: DielectricSpec[] = geom.slabs.map((sl) => ({
    dk: sl.er,
    df: o.df,
    f0: o.f0Hz,
  }));
  const dkAt = (sp: DielectricSpec) => djordjevicSarkar(sp).dk(o.fHz);
  geom.slabs = geom.slabs.map((sl, i) => ({ ...sl, er: dkAt(slabSpecs[i]) }));
  const maskSpec = geom.mask ? { dk: geom.mask.er, df: o.maskDf ?? o.df, f0: o.maskF0Hz ?? o.f0Hz } : undefined;
  if (geom.mask && maskSpec) geom.mask = { ...geom.mask, er: dkAt(maskSpec) };
  return {
    geom,
    slabSpecs,
    maskSpec,
    fRef: o.fHz,
    freqs: [o.fHz],
    rough: { model: 'hammerstad', rq: o.rqUm },
    tempC: o.tempC ?? 20,
    accuracy: o.accuracy,
  };
}

/** Delay of a line in ps per mm from its effective permittivity. */
export const psPerMm = (eeff: number) => (Math.sqrt(eeff) * 1e-3 * 1e12) / C0;

/** Trace length that produces a given delay, mm. */
export const lengthForPs = (ps: number, psMm: number) => ps / psMm;

/** Route length that uses up the whole loss budget, mm. */
export const maxLengthForLoss = (budgetDb: number, dbPerMm: number) => budgetDb / dbPerMm;

/** What the field solver found for the line on the chosen layer. */
export interface LineMetrics {
  w: number; // mm
  s?: number; // mm, differential only
  z: number; // Ω (Zdiff for a pair)
  eeff: number;
  dbPerMm: number; // insertion loss per mm at the Nyquist frequency
}

export type Status = 'ok' | 'warn' | 'fail' | 'info';

export interface CheckRow {
  label: string;
  required: string;
  value: string;
  status: Status;
  note?: string;
}

export interface FabLimits {
  minW: number;
  minS: number;
  maxW: number;
}

/** Length formatter in the user's unit (mm in, formatted string out). */
export type LenFmt = (mm: number) => string;

/** Frequency label that stays readable below 1 GHz (62.5 MHz, not 0.0625 GHz). */
export const freqLabel = (gHz: number) => (gHz >= 1 ? `${Number(gHz.toPrecision(4))} GHz` : `${Number((gHz * 1000).toPrecision(4))} MHz`);

/** Line rate label: Gb/s for fast links, Mb/s below 1 Gb/s. */
export const rateLabel = (gbps: number) => (gbps >= 1 ? `${Number(gbps.toPrecision(4))} Gb/s` : `${Number((gbps * 1000).toPrecision(4))} Mb/s`);

/**
 * Rules that can be checked against the board: the geometry against the fab limits,
 * the routed length against the loss budget, and each skew limit as a length.
 */
export function evaluateInterface(spec: InterfaceSpec, line: LineMetrics, fab: FabLimits, lengthMm: number, L: LenFmt, second?: { w: number; s?: number }): CheckRow[] {
  const rows: CheckRow[] = [];
  const pm = psPerMm(line.eeff);

  const geometry = (label: string, required: string, w: number, s: number | undefined): CheckRow => {
    const ok = w >= fab.minW && (s === undefined || s >= fab.minS) && w <= fab.maxW;
    return {
      label,
      required,
      value: s !== undefined ? `${L(w)} / ${L(s)}` : L(w),
      status: ok ? 'ok' : 'fail',
      note: ok
        ? undefined
        : w < fab.minW
          ? `Narrower than the fab minimum of ${L(fab.minW)}: a thicker dielectric or another layer gives a wider line.`
          : w > fab.maxW
            ? `Wider than the ${L(fab.maxW)} you can route: a thinner dielectric gives a narrower line.`
            : `Spacing is below the fab minimum of ${L(fab.minS)}.`,
    };
  };

  rows.push(
    geometry(
      line.s !== undefined ? 'Trace width / spacing' : 'Trace width',
      `${spec.z.target} Ω ${spec.z.kind === 'diff' ? 'differential' : 'single-ended'}`,
      line.w,
      line.s,
    ),
  );
  if (spec.z2 && second) rows.push(geometry(spec.z2.label, `${spec.z2.target} Ω ${spec.z2.kind === 'diff' ? 'differential' : 'single-ended'}`, second.w, second.s));

  if (spec.lossBudgetDb !== undefined && Number.isFinite(line.dbPerMm) && line.dbPerMm > 0) {
    const used = line.dbPerMm * lengthMm;
    rows.push({
      label: `Insertion loss at ${freqLabel(spec.nyquistGHz)}`,
      required: `≤ ${spec.lossBudgetDb} dB`,
      value: `${used.toFixed(2)} dB over ${L(lengthMm)}`,
      status: used <= spec.lossBudgetDb ? (used > 0.8 * spec.lossBudgetDb ? 'warn' : 'ok') : 'fail',
      note: spec.lossNote,
    });
    rows.push({
      label: 'Longest route inside the budget',
      required: `${spec.lossBudgetDb} dB`,
      value: L(maxLengthForLoss(spec.lossBudgetDb, line.dbPerMm)),
      status: 'info',
      note: `${(line.dbPerMm * 25.4).toFixed(3)} dB/in on this layer; traces only, so connectors, vias and the package still have to come out of the same budget.`,
    });
  }

  // some guides limit the laminate rather than the length: dB per inch per GHz
  if (spec.maxLossPerInGHz !== undefined && Number.isFinite(line.dbPerMm) && line.dbPerMm > 0) {
    const perInGHz = (line.dbPerMm * 25.4) / spec.nyquistGHz;
    rows.push({
      label: 'Loss per inch per GHz',
      required: `≤ ${spec.maxLossPerInGHz} dB/in/GHz`,
      value: `${perInGHz.toFixed(3)} dB/in/GHz`,
      status: perInGHz <= spec.maxLossPerInGHz ? 'ok' : 'fail',
      note: 'The published trace-length limits assume a laminate no lossier than this; a lossier board has to be routed shorter.',
    });
  }

  if (spec.maxLenMm !== undefined) {
    rows.push({
      label: 'Maximum length in the specification',
      required: L(spec.maxLenMm),
      value: L(lengthMm),
      status: lengthMm <= spec.maxLenMm ? 'ok' : 'fail',
    });
  }

  // memory interfaces give the limit as a delay, which becomes a length only on a known layer
  if (spec.maxDelayPs !== undefined) {
    const limit = lengthForPs(spec.maxDelayPs, pm);
    rows.push({
      label: 'Maximum route delay',
      required: `${spec.maxDelayPs} ps`,
      value: `${L(limit)} allowed, you have ${L(lengthMm)}`,
      status: lengthMm <= limit ? 'ok' : 'fail',
      note: `The limit is a delay, so it buys less trace on this layer than on a faster one (${pm.toFixed(2)} ps/mm here).`,
    });
  }

  const skew = (label: string, ps?: number, len?: number) => {
    if (ps === undefined && len === undefined) return;
    const limitMm = len !== undefined ? len : lengthForPs(ps as number, pm);
    rows.push({
      label,
      // specifications state a skew either as a time or as a length in mil; keep their own wording
      required: ps !== undefined ? `${ps} ps` : `${Number(((len as number) / 0.0254).toPrecision(3))} mil`,
      value: L(limitMm),
      status: 'info',
      note: ps !== undefined ? `Length tolerance at ${pm.toFixed(2)} ps/mm on this layer.` : 'The specification gives a length, so it does not depend on the layer.',
    });
  };
  skew(spec.skewLabels?.intra ?? 'Intra-pair skew (P vs N)', spec.intraPairPs, spec.intraPairMm);
  skew(spec.skewLabels?.lane ?? 'Lane-to-lane skew', spec.laneSkewPs, spec.laneSkewMm);

  rows.push({
    label: 'Delay on this layer',
    required: '—',
    value: `${pm.toFixed(2)} ps/mm`,
    status: 'info',
    note: `εeff ${line.eeff.toFixed(2)}, so ${L(lengthForPs(1, pm))} of trace is worth 1 ps of matching.`,
  });
  return rows;
}
