// Unit definitions, conversions and number formatting shared by all tools.

export const C0 = 299_792_458; // speed of light, m/s
export const ETA0 = 376.730313668; // free-space impedance, ohm
export const MM_PER_MIL = 0.0254;
export const MM_PER_OZ = 1.378 * MM_PER_MIL; // 1 oz/ft² copper ≈ 0.035 mm

export type LenUnit = 'mm' | 'mil' | 'um' | 'in' | 'cm' | 'oz';

export const LEN_UNITS: Record<LenUnit, { label: string; toMm: number }> = {
  mm: { label: 'mm', toMm: 1 },
  mil: { label: 'mil', toMm: MM_PER_MIL },
  um: { label: 'µm', toMm: 0.001 },
  in: { label: 'in', toMm: 25.4 },
  cm: { label: 'cm', toMm: 10 },
  oz: { label: 'oz', toMm: MM_PER_OZ },
};

export const toMm = (v: number, u: LenUnit) => v * LEN_UNITS[u].toMm;
export const fromMm = (mm: number, u: LenUnit) => mm / LEN_UNITS[u].toMm;

const nf = new Map<number, Intl.NumberFormat>();
function formatter(sig: number) {
  let f = nf.get(sig);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { maximumSignificantDigits: sig });
    nf.set(sig, f);
  }
  return f;
}

/** Format with a fixed number of significant digits, switching to exponent for extremes. */
export function fmt(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-4)) return v.toExponential(Math.max(1, sig - 2));
  return formatter(sig).format(v);
}

const PREFIXES: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

/** Format with an SI prefix: si(0.0123, 'Ω') → "12.3 mΩ". */
export function si(v: number, unit: string, sig = 4): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return `0 ${unit}`;
  // round first so 999.96 becomes 1000 and gets the next prefix ("1 kΩ", not "1,000 Ω")
  const a = Math.abs(Number(v.toPrecision(sig)));
  for (const [m, p] of PREFIXES) {
    if (a >= m * 0.9999999) return `${fmt(v / m, sig)} ${p}${unit}`;
  }
  const [m, p] = PREFIXES[PREFIXES.length - 1];
  return `${fmt(v / m, sig)} ${p}${unit}`;
}

/** Plain number string suitable for an <input> value (no grouping, trimmed). */
export function plain(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toPrecision(digits)));
}

export const cToF = (c: number) => c * 1.8 + 32;
export const fToC = (f: number) => (f - 32) / 1.8;
