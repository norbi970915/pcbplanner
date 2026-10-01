// Single-ended 4-port S-parameters to mixed-mode S-parameters.
//
// Bockelman & Eisenstadt (IEEE Trans. MTT 43(7), 1995) and Touchstone 2.1 Appendix A:
// with both ports of a pair referenced to the same real resistance R (differential
// reference 2R, common-mode reference R/2), the mixed-mode waves are
//   a_D = (a_p − a_n)/√2,  a_C = (a_p + a_n)/√2   (and the same for b),
// so S_mm = M · S · Mᵀ, where M is orthogonal (M⁻¹ = Mᵀ).
import type { Matrices, Network } from './touchstone';

/**
 * Port numbering of a 4-port that holds one differential pair.
 * '13': ports 1 and 2 form the input pair, 3 and 4 the output pair; lines run 1→3 and 2→4.
 * '12': ports 1 and 3 form the input pair, 2 and 4 the output pair; lines run 1→2 and 3→4.
 */
export type PairConvention = '13' | '12';

/** Positive and negative single-ended port (0-based) of the input pair and the output pair. */
export function pairPorts(conv: PairConvention): { p: [number, number]; n: [number, number] } {
  return conv === '13' ? { p: [0, 2], n: [1, 3] } : { p: [0, 1], n: [2, 3] };
}

export interface MixedNetwork extends Matrices {
  /** Order of the mixed-mode matrix rows and columns: D1, D2, C1, C2. */
  ports: 4;
  /** Differential reference of pair 1 and pair 2, Ω (twice the single-ended reference). */
  diffRefOhms: [number, number];
  /** Common-mode reference of pair 1 and pair 2, Ω (half the single-ended reference). */
  commonRefOhms: [number, number];
  /** Pairs whose two ports have different references, which the conversion does not account for. */
  unequalPairs: number[];
}

/** Mixed-mode index of a parameter name such as 'dd21' or 'cd11' (row, column in D1 D2 C1 C2 order). */
export function mixedIndex(name: string): [number, number] | null {
  const m = /^([dc])([dc])([12])([12])$/i.exec(name);
  if (!m) return null;
  const row = (m[1].toLowerCase() === 'c' ? 2 : 0) + Number(m[3]) - 1;
  const col = (m[2].toLowerCase() === 'c' ? 2 : 0) + Number(m[4]) - 1;
  return [row, col];
}

/** Converts a single-ended 4-port to mixed mode with the given pair convention. */
export function toMixedMode(net: Network, conv: PairConvention): MixedNetwork {
  if (net.ports !== 4) throw new Error('Mixed-mode conversion needs a 4-port network.');
  const { p, n } = pairPorts(conv);
  const g = Math.SQRT1_2;
  // M: rows D1, D2, C1, C2; columns single-ended ports 1–4
  const M = new Float64Array(16);
  for (let k = 0; k < 2; k++) {
    M[k * 4 + p[k]] = g;
    M[k * 4 + n[k]] = -g;
    M[(2 + k) * 4 + p[k]] = g;
    M[(2 + k) * 4 + n[k]] = g;
  }
  const count = net.freq.length;
  const re = new Float64Array(count * 16);
  const im = new Float64Array(count * 16);
  const tr = new Float64Array(16), ti = new Float64Array(16);
  for (let f = 0; f < count; f++) {
    const b = f * 16;
    // T = M · S
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sr = 0, si = 0;
        for (let m = 0; m < 4; m++) {
          const w = M[i * 4 + m];
          if (w === 0) continue;
          sr += w * net.re[b + m * 4 + j];
          si += w * net.im[b + m * 4 + j];
        }
        tr[i * 4 + j] = sr;
        ti[i * 4 + j] = si;
      }
    }
    // S_mm = T · Mᵀ
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sr = 0, si = 0;
        for (let m = 0; m < 4; m++) {
          const w = M[j * 4 + m];
          if (w === 0) continue;
          sr += tr[i * 4 + m] * w;
          si += ti[i * 4 + m] * w;
        }
        re[b + i * 4 + j] = sr;
        im[b + i * 4 + j] = si;
      }
    }
  }
  const R = net.referenceOhms;
  const unequalPairs: number[] = [];
  for (let k = 0; k < 2; k++) if (Math.abs(R[p[k]] - R[n[k]]) > 1e-9 * Math.max(R[p[k]], R[n[k]])) unequalPairs.push(k + 1);
  return {
    ports: 4,
    freq: net.freq,
    re,
    im,
    diffRefOhms: [2 * R[p[0]], 2 * R[p[1]]],
    commonRefOhms: [R[p[0]] / 2, R[p[1]] / 2],
    unequalPairs,
  };
}
