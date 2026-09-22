// Frequency-dependent laminate permittivity.
//
// Djordjevic–Sarkar wideband Debye model (IEEE Trans. EMC 43(4), 2001):
//   ε(ω) = ε∞ + Δε / (m2 − m1) · log10( (ω2 + jω) / (ω1 + jω) )
// It is causal (Kramers–Kronig consistent), gives an almost constant loss tangent between
// ω1 and ω2 with Dk falling slowly with frequency, which is how glass/epoxy laminates behave.
// The two free parameters (ε∞, Δε) are fitted to one datasheet point Dk, Df at f0.

export interface DielectricSpec {
  dk: number; // relative permittivity at f0
  df: number; // dissipation factor (loss tangent) at f0
  f0: number; // Hz
}

export interface DielectricModel {
  dk(fHz: number): number;
  df(fHz: number): number;
}

/** Corner angular frequencies of the model (rad/s): 10^4 and 10^12, the common default. */
export const DS_M1 = 4;
export const DS_M2 = 12;

/** log10((ω2 + jω)/(ω1 + jω)) / (m2 − m1) as [re, im]. */
function dsShape(fHz: number): [number, number] {
  const w = 2 * Math.PI * fHz;
  const w1 = 10 ** DS_M1;
  const w2 = 10 ** DS_M2;
  // ln of a complex ratio: ln|a/b| + j(arg a − arg b)
  const re = 0.5 * Math.log((w2 * w2 + w * w) / (w1 * w1 + w * w));
  const im = Math.atan2(w, w2) - Math.atan2(w, w1);
  const k = Math.LN10 * (DS_M2 - DS_M1);
  return [re / k, im / k];
}

export function djordjevicSarkar(spec: DielectricSpec): DielectricModel {
  if (!(spec.df > 0)) {
    // lossless: constant Dk
    return { dk: () => spec.dk, df: () => 0 };
  }
  const [re0, im0] = dsShape(spec.f0);
  // ε = ε' − jε''  with ε'' = Dk·Df;  Im(shape) < 0 so Δε > 0
  const dEps = (-spec.dk * spec.df) / im0;
  const eInf = spec.dk - dEps * re0;
  return {
    dk: (f) => eInf + dEps * dsShape(f)[0],
    df: (f) => {
      const [re, im] = dsShape(f);
      return (-dEps * im) / (eInf + dEps * re);
    },
  };
}
