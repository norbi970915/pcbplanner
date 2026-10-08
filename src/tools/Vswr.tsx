import { useId, useState } from 'react';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import type { DataSource } from '../data/source';
import { fmt } from '../lib/units';
import { cascadeBounds, fromImpedance, matchFrom, mismatchBounds, quantityError, quantityOf, VSWR_TABLE, type LoadMatch, type Match, type Quantity } from '../lib/vswr';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'value', qty: 'vswr', val: 1.5, r: 75, x: 25, z0: 50, um: 'vswr', s1: 1.5, s2: 2 };

const QTY: Record<Quantity, { label: string; unit: string; pct?: boolean; fallback: number }> = {
  vswr: { label: 'VSWR', unit: ': 1', fallback: 1.5 },
  gamma: { label: 'Reflection coefficient |Γ|', unit: '', fallback: 0.2 },
  rl: { label: 'Return loss', unit: 'dB', fallback: 20 },
  ml: { label: 'Mismatch loss', unit: 'dB', fallback: 0.1 },
  reflected: { label: 'Reflected power', unit: '%', pct: true, fallback: 4 },
  transmitted: { label: 'Transmitted power', unit: '%', pct: true, fallback: 96 },
};
const TABLE = VSWR_TABLE.map((s) => matchFrom('vswr', s)!);
const QTY_KEYS = Object.keys(QTY) as Quantity[];
const asQty = (v: string): Quantity => (QTY_KEYS.includes(v as Quantity) ? (v as Quantity) : 'vswr');

/** Finite numbers through fmt (v + 0 turns −0 into 0); ∞ and −∞ written out; anything else a dash. */
const num = (v: number, sig = 5) => (Number.isFinite(v) ? fmt(v + 0, sig) : v === Infinity ? '∞' : v === -Infinity ? '−∞' : '—');
const signed = (v: number, sig = 4) => (v > 0 && Number.isFinite(v) ? `+${fmt(v, sig)}` : num(v, sig));
const ratio = (v: number, sig = 5) => `${num(v, sig)} : 1`;
const pct = (frac: number, sig = 5) => num(frac * 100, sig);
const complex = (re: number, im: number, sig = 4) => `${fmt(re, sig)} ${im < 0 ? '−' : '+'} j${fmt(Math.abs(im), sig)}`;
/** Value shown in an input for a quantity (percent for powers), rounded so the field is not cluttered. */
const inputValue = (m: Match, q: Quantity) => {
  const v = quantityOf(m, q) * (QTY[q].pct ? 100 : 1);
  return Number.isFinite(v) ? Number(v.toPrecision(10)) : QTY[q].fallback;
};

export default function Vswr() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode = p.mode === 'z' ? 'z' : 'value';
  const qty = asQty(p.qty);
  const um: 'vswr' | 'gamma' = p.um === 'gamma' ? 'gamma' : 'vswr';
  const errors: string[] = [];
  const notes: string[] = [];

  // --- the match being analysed
  let match: Match | null = null;
  let load: LoadMatch | null = null;
  if (mode === 'value') {
    let v = p.val;
    if ((qty === 'rl' || qty === 'ml') && v < 0) {
      v = -v;
      notes.push(
        qty === 'rl'
          ? `${fmt(p.val, 6)} dB is the S-parameter form, S11 = 20 log₁₀|Γ|. Return loss is defined as a positive number, RL = −S11, so ${fmt(v, 6)} dB is used.`
          : `Mismatch loss is defined as a positive number of dB lost to reflection, so ${fmt(v, 6)} dB is used.`,
      );
    }
    const lib = QTY[qty].pct ? v / 100 : v;
    const e = quantityError(qty, lib);
    if (e) errors.push(e);
    else match = matchFrom(qty, lib);
  } else {
    if (!(p.z0 > 0)) errors.push('The reference impedance Z0 must be greater than 0.');
    if (p.r < 0) errors.push('R below 0 is an active (negative-resistance) load: |Γ| > 1 and VSWR is not defined. This calculator covers passive loads, R ≥ 0.');
    if (!errors.length) {
      load = fromImpedance(p.r, p.x, p.z0);
      match = load;
    }
  }
  if (match && match.gamma === 0) notes.push('Perfect match: nothing is reflected, so the return loss is infinite (∞) and the mismatch loss is 0 dB.');
  if (match && match.gamma >= 1) notes.push('Total reflection (|Γ| = 1): no power reaches the load, so VSWR and mismatch loss are infinite and the return loss is 0 dB.');

  // --- mismatch between a source and a load
  const e1 = quantityError(um, p.s1);
  const e2 = quantityError(um, p.s2);
  if (e1) errors.push(`Source: ${e1}`);
  if (e2) errors.push(`Load: ${e2}`);
  const src = e1 ? null : matchFrom(um, p.s1);
  const dst = e2 ? null : matchFrom(um, p.s2);
  const bounds = src && dst ? mismatchBounds(src, dst) : null;
  const cascade = src && dst ? cascadeBounds(src, dst) : null;

  const switchQty = (q: Quantity) => set({ qty: q, val: match ? inputValue(match, q) : QTY[q].fallback });
  const switchUm = (u: 'vswr' | 'gamma') => {
    if (u === um) return;
    set({ um: u, s1: src ? inputValue(src, u) : DEFAULTS.s1, s2: dst ? inputValue(dst, u) : DEFAULTS.s2 });
  };

  const properties = (
    <>
      <Section title="Input">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Enter</span>
          <Segmented
            label="Input"
            value={mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: 'value', label: 'One quantity' },
              { value: 'z', label: 'Load impedance' },
            ]}
          />
        </div>
        {mode === 'value' ? (
          <>
            <SelectField label="Known quantity" value={qty} onChange={switchQty} width={170} options={QTY_KEYS.map((k) => ({ value: k, label: QTY[k].label }))} />
            <NumField
              label={QTY[qty].label}
              value={p.val}
              onChange={(v) => set({ val: v })}
              unit={QTY[qty].unit}
              allowNegative={qty === 'rl' || qty === 'ml'}
              allowZero
              hint={qty === 'rl' ? 'Positive by definition. A negative value is read as S11 in dB and its sign is dropped.' : undefined}
            />
          </>
        ) : (
          <>
            <NumField label="Load resistance" symbol="R" value={p.r} onChange={(v) => set({ r: v })} unit="Ω" allowZero />
            <NumField label="Load reactance" symbol="X" value={p.x} onChange={(v) => set({ x: v })} unit="Ω" allowNegative hint="Positive for inductive, negative for capacitive loads." />
            <NumField label="Reference impedance" symbol="Z0" value={p.z0} onChange={(v) => set({ z0: v })} unit="Ω" />
          </>
        )}
      </Section>
      <Section title="Source and Load Mismatch">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Enter as</span>
          <Segmented
            label="Mismatch entered as"
            value={um}
            onChange={switchUm}
            options={[
              { value: 'vswr', label: 'VSWR' },
              { value: 'gamma', label: '|Γ|' },
            ]}
          />
        </div>
        <NumField label="Source" symbol={um === 'vswr' ? 'VSWRs' : '|Γs|'} value={p.s1} onChange={(v) => set({ s1: v })} unit={um === 'vswr' ? ': 1' : ''} allowZero />
        <NumField label="Load" symbol={um === 'vswr' ? 'VSWRl' : '|Γl|'} value={p.s2} onChange={(v) => set({ s2: v })} unit={um === 'vswr' ? ': 1' : ''} allowZero />
        <p className="text-faint">Phases unknown: the results are the limits over every phase.</p>
      </Section>
    </>
  );

  const status = match ? `VSWR ${ratio(match.vswr, 4)} · |Γ| ${num(match.gamma, 4)} · RL ${num(match.rl, 4)} dB · ML ${num(match.ml, 4)} dB` : 'Check the inputs';

  return (
    <ToolPage
      title="VSWR, Return Loss & Mismatch Loss Calculator"
      description="Convert between VSWR, reflection coefficient, return loss, mismatch loss and reflected power, find Γ of a complex load, and bound the mismatch uncertainty and cascaded VSWR of two mismatched ports."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {match && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Match">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              <Big label="VSWR" value={num(match.vswr, 5)} unit=": 1" />
              <Big label="Return loss" value={num(match.rl, 5)} unit="dB" />
              <Big label="Mismatch loss" value={num(match.ml, 4)} unit="dB" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="VSWR" value={ratio(match.vswr, 6)} sub="(1 + |Γ|) / (1 − |Γ|)" />
                <Result label="Reflection coefficient |Γ|" value={num(match.gamma, 6)} strong />
                {load && <Result label="Γ (complex)" value={match.gamma > 0 ? `${complex(load.re, load.im, 5)}` : '0'} sub={match.gamma > 0 ? `angle ${fmt(load.angleDeg, 5)}°` : 'angle undefined at |Γ| = 0'} />}
                <Result label="Return loss RL" value={num(match.rl, 6)} unit="dB" sub="−20 log₁₀|Γ|, positive by definition" />
                <Result label="S11 (same quantity, S-parameter sign)" value={num(0 - match.rl, 6)} unit="dB" sub="20 log₁₀|Γ| = −RL" />
                <Result label="Mismatch loss ML" value={num(match.ml, 6)} unit="dB" sub="−10 log₁₀(1 − |Γ|²), with a matched source" />
                <Result label="Reflected power" value={pct(match.reflected)} unit="%" sub="|Γ|²" />
                <Result label="Power delivered to the load" value={pct(match.transmitted)} unit="%" sub="1 − |Γ|²" />
                <Result label="Standing-wave maximum / minimum" value={`${fmt(1 + match.gamma, 5)} / ${fmt(1 - match.gamma, 5)}`} unit="× |V⁺|" sub="1 ± |Γ| times the incident voltage" />
                {load && (
                  <>
                    <Result label="Normalised load z = ZL / Z0" value={complex(p.r / p.z0, p.x / p.z0, 5)} />
                    <Result
                      label="Load admittance Y = G + jB"
                      value={Number.isFinite(load.g) ? complex(load.g * 1e3, load.b * 1e3, 5) : '∞ (short circuit)'}
                      unit="mS"
                      sub={Number.isFinite(load.g) ? `normalised y = Y · Z0 = ${complex(load.g * p.z0, load.b * p.z0, 4)}` : undefined}
                    />
                  </>
                )}
              </tbody>
            </table>
          </Panel>
          <Panel title="Reflection Coefficient Plane">
            <GammaChart gamma={match.gamma} point={load ? { re: load.re, im: load.im } : null} />
            <p className="px-3 pb-2 text-faint">
              Impedance Smith chart normalised to {mode === 'z' ? `${fmt(p.z0, 4)} Ω` : 'Z0'}. Dashed: the circle of constant |Γ| (constant VSWR).{' '}
              {load ? 'Dot: this load.' : 'A single magnitude has no phase, so every point on the circle has these values.'}
            </p>
          </Panel>
        </div>
      )}
      {match && (
        <Panel title="Return Loss and Mismatch Loss versus VSWR">
          <LossPlot vswr={match.vswr} />
        </Panel>
      )}
      {src && dst && bounds && cascade && (
        <Panel title="Mismatch Between Source and Load">
          <table className="tbl">
            <tbody>
              <Result label="Source" value={`|Γs| ${num(src.gamma, 5)}`} sub={`VSWR ${ratio(src.vswr, 5)}, RL ${num(src.rl, 4)} dB`} />
              <Result label="Load" value={`|Γl| ${num(dst.gamma, 5)}`} sub={`VSWR ${ratio(dst.vswr, 5)}, RL ${num(dst.rl, 4)} dB`} />
              <Result label="|Γs| · |Γl|" value={num(bounds.product, 5)} />
              <Result
                label="Power into the load, relative to a Z0 source"
                value={`${signed(bounds.powerMinDb)} to ${signed(bounds.powerMaxDb)}`}
                unit="dB"
                strong
                sub={`1 / |1 − ΓsΓl|²: ${signed((10 ** (bounds.powerMinDb / 10) - 1) * 100, 4)} % to ${signed((10 ** (bounds.powerMaxDb / 10) - 1) * 100, 4)} % — the mismatch uncertainty`}
              />
              <Result
                label="Total mismatch loss"
                value={`${num(bounds.lossMinDb, 4)} to ${num(bounds.lossMaxDb, 4)}`}
                unit="dB"
                strong
                sub={`available source power to load power; with a Z0 source it would be ${num(dst.ml, 4)} dB`}
              />
              <Result label="Cascaded VSWR" value={`${num(cascade.vswrMin, 5)} to ${num(cascade.vswrMax, 5)}`} unit=": 1" strong sub="the two mismatches seen together at unknown phase, VSWRhigh / VSWRlow to VSWRs · VSWRl" />
              <Result label="Cascaded |Γ|" value={`${num(cascade.gammaMin, 5)} to ${num(cascade.gammaMax, 5)}`} sub="(|Γs| ∓ |Γl|) / (1 ∓ |Γs||Γl|)" />
            </tbody>
          </table>
        </Panel>
      )}
      <Panel title="Quick Reference">
        <table className="tbl">
          <thead>
            <tr>
              <th className="v">VSWR</th>
              <th className="v">|Γ|</th>
              <th className="v">Return loss (dB)</th>
              <th className="v">Mismatch loss (dB)</th>
              <th className="v">Reflected (%)</th>
              <th className="v">Delivered (%)</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map((r) => {
              const current = mode === 'value' && qty === 'vswr' && p.val === r.vswr;
              return (
                <tr key={r.vswr} className={current ? 'sel' : ''}>
                  <td className="v">{fmt(r.vswr, 3)}</td>
                  <td className="v">{r.gamma.toFixed(4)}</td>
                  <td className="v">{Number.isFinite(r.rl) ? r.rl.toFixed(2) : '∞'}</td>
                  <td className="v">{fmt(r.ml, 3)}</td>
                  <td className="v">{fmt(r.reflected * 100, 3)}</td>
                  <td className="v">{fmt(r.transmitted * 100, 4)}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => set({ mode: 'value', qty: 'vswr', val: r.vswr })} aria-label={`Use VSWR ${fmt(r.vswr, 3)}`}>
                      Use
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </ToolPage>
  );
}

/** Impedance Smith chart (Γ plane) with the constant-|Γ| circle and, for a complex load, its point. */
function GammaChart({ gamma, point }: { gamma: number; point: { re: number; im: number } | null }) {
  const clip = useId();
  const S = 260, c = S / 2, R = 112;
  const X = (re: number) => c + R * re;
  const Y = (im: number) => c - R * im;
  const rs = [0.2, 0.5, 1, 2, 5];
  const xs = [0.2, 0.5, 1, 2, 5];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto block h-auto w-full max-w-[340px]" role="img" aria-label={`Reflection coefficient plane with the |Γ| = ${fmt(gamma, 3)} circle`}>
      <defs>
        <clipPath id={clip}>
          <circle cx={c} cy={c} r={R} />
        </clipPath>
      </defs>
      <g fill="none" stroke="var(--line)" strokeWidth={1}>
        <g clipPath={`url(#${clip})`}>
          {rs.map((r) => (
            <circle key={`r${r}`} cx={X(r / (1 + r))} cy={c} r={R / (1 + r)} />
          ))}
          {xs.flatMap((x) => [x, -x]).map((x) => (
            <circle key={`x${x}`} cx={X(1)} cy={Y(1 / x)} r={R / Math.abs(x)} />
          ))}
        </g>
        <line x1={c - R} x2={c + R} y1={c} y2={c} />
        <circle cx={c} cy={c} r={R} stroke="var(--line-strong)" />
      </g>
      <g fontSize={9} fill="var(--faint)" textAnchor="middle">
        {rs.map((r) => (
          <text key={r} x={X((r - 1) / (r + 1)) - 2} y={c + 10}>
            {r}
          </text>
        ))}
        <text x={X(0) + 8} y={Y(1) + 11}>+j</text>
        <text x={X(0) + 8} y={Y(-1) - 4}>−j</text>
      </g>
      {gamma > 0 && <circle cx={c} cy={c} r={R * Math.min(1, gamma)} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" />}
      {point && <circle cx={X(point.re)} cy={Y(point.im)} r={4.5} fill="var(--accent)" stroke="var(--sheet)" strokeWidth={2} />}
      <circle cx={c} cy={c} r={2} fill="var(--muted)" />
    </svg>
  );
}

const PLOT_TICKS = [1.01, 1.02, 1.05, 1.1, 1.2, 1.5, 2, 3, 5, 10];
const W = 640, H = 260, left = 58, right = 18, top = 22, bottom = 38;
const u0 = -2, u1 = Math.log10(9); // VSWR 1.01 … 10
const y0 = -4, y1 = 2; // 0.0001 … 100 dB
const Xs = (s: number) => left + ((Math.log10(s - 1) - u0) / (u1 - u0)) * (W - left - right);
const Yd = (db: number) => top + ((y1 - Math.log10(db)) / (y1 - y0)) * (H - top - bottom);
/** The two curves never change, so they are built once. */
const CURVES = (() => {
  const pts = Array.from({ length: 161 }, (_, i) => matchFrom('vswr', 1 + 10 ** (u0 + ((u1 - u0) * i) / 160))!);
  const path = (k: 'rl' | 'ml') => pts.map((m, i) => `${i ? 'L' : 'M'}${Xs(m.vswr).toFixed(1)},${Yd(m[k]).toFixed(1)}`).join(' ');
  return { rl: path('rl'), ml: path('ml') };
})();

/** RL and ML against VSWR on log axes: x = log10(VSWR − 1) spreads the well-matched region; y = log10(dB). */
function LossPlot({ vswr }: { vswr: number }) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? (vswr >= 1.01 && vswr <= 10 ? vswr : null);
  const at = shown !== null ? matchFrom('vswr', shown) : null;
  const pointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.max(0, Math.min(1, (x - left) / (W - left - right)));
    return 1 + 10 ** (u0 + t * (u1 - u0));
  };
  return (
    <div className="min-w-0 px-2 pt-2">
      <div className="flex flex-wrap gap-4 px-2 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--accent)" strokeWidth={2} /></svg>Return loss
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--copper)" strokeWidth={2} /></svg>Mismatch loss
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[720px]" role="img" aria-label="Return loss and mismatch loss in dB versus VSWR, logarithmic axes" onPointerMove={(e) => setHover(pointer(e))} onPointerLeave={() => setHover(null)}>
        <defs>
          <clipPath id={clip}>
            <rect x={left} y={top} width={W - left - right} height={H - top - bottom} />
          </clipPath>
        </defs>
        <text x={left} y={13} fontSize={12} fill="var(--ink)">Loss (dB, log scale)</text>
        {PLOT_TICKS.map((s) => (
          <g key={s}>
            <line x1={Xs(s)} x2={Xs(s)} y1={top} y2={H - bottom} stroke="var(--line)" />
            <text x={Xs(s)} y={H - bottom + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmt(s, 3)}</text>
          </g>
        ))}
        {[-4, -3, -2, -1, 0, 1, 2].map((e) => (
          <g key={e}>
            <line x1={left} x2={W - right} y1={Yd(10 ** e)} y2={Yd(10 ** e)} stroke="var(--line)" />
            <text x={left - 6} y={Yd(10 ** e) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(10 ** e, 1)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          <path d={CURVES.rl} fill="none" stroke="var(--accent)" strokeWidth={2} />
          <path d={CURVES.ml} fill="none" stroke="var(--copper)" strokeWidth={2} />
          {at && (
            <>
              <line x1={Xs(at.vswr)} x2={Xs(at.vswr)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />
              {at.rl > 0 && <circle cx={Xs(at.vswr)} cy={Yd(at.rl)} r={4} fill="var(--accent)" stroke="var(--sheet)" strokeWidth={2} />}
              {at.ml > 0 && <circle cx={Xs(at.vswr)} cy={Yd(at.ml)} r={4} fill="var(--copper)" stroke="var(--sheet)" strokeWidth={2} />}
            </>
          )}
        </g>
        <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
        <text x={(left + W - right) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">VSWR (axis spaced as log(VSWR − 1))</text>
      </svg>
      <p className="px-2 pb-2 text-muted">
        {at
          ? `${hover !== null ? 'Pointer' : 'Current'}: VSWR ${fmt(at.vswr, 4)} : 1 · RL ${fmt(at.rl, 4)} dB · ML ${fmt(at.ml, 3)} dB`
          : `The current VSWR (${num(vswr, 4)} : 1) is outside the plotted 1.01 to 10 range.`}
      </p>
    </div>
  );
}

const SOURCES: readonly DataSource[] = [
  {
    title: 'Fluke Calibration, "Minimizing RF mismatch errors and uncertainties", application note 6005964a-en, 2015',
    url: 'https://media.fluke.com/4da2688e-6c68-45ee-8ed5-b2e700354f47_original%20file.pdf',
    note: 'Power error = 1 − 1/(1 ± |Γs||Γl|)², |Γ| = (VSWR − 1)/(VSWR + 1), return loss = 20 log|Γ|⁻¹. Checked against the mismatch limits here.',
  },
  {
    title: 'NAWCWD TP 8347, Electronic Warfare and Radar Systems Engineering Handbook, section 6-2, VSWR, reflection coefficient and mismatch loss (reproduced by RF Cafe)',
    url: 'https://www.rfcafe.com/references/electrical/ew-radar-handbook/vswr-reflection-coefficient-mismatch-loss.htm',
    note: 'Mismatch loss = −10 log(1 − ρ²); worked example VSWR 2:1 → ρ 0.333, ML 0.51 dB, RL 9.54 dB, 11 % reflected, used as a test case.',
  },
];

export function Method() {
  return (
    <>
      <h2>Reflection coefficient and standing waves</h2>
      <p>
        A load <i>Z</i>
        <sub>L</sub> on a line of characteristic impedance <i>Z</i>
        <sub>0</sub> reflects part of the incident wave. The reflection coefficient and the voltage standing-wave ratio are (Pozar §2.3):
      </p>
      <div className="eq">
        <span className="no">(1)</span>Γ = (<i>Z</i>
        <sub>L</sub> − <i>Z</i>
        <sub>0</sub>) / (<i>Z</i>
        <sub>L</sub> + <i>Z</i>
        <sub>0</sub>)
      </div>
      <div className="eq">
        <span className="no">(2)</span>VSWR = (1 + |Γ|) / (1 − |Γ|), |Γ| = (VSWR − 1) / (VSWR + 1)
      </div>
      <p>The voltage on the line swings between (1 + |Γ|) and (1 − |Γ|) times the incident amplitude |V⁺|; VSWR is the ratio of the two.</p>
      <h2>Return loss, mismatch loss and power</h2>
      <div className="eq">
        <span className="no">(3)</span>RL = −20 log₁₀|Γ| dB, ML = −10 log₁₀(1 − |Γ|²) dB
      </div>
      <p>
        |Γ|² of the incident power is reflected and 1 − |Γ|² reaches the load. Return loss says how far below the incident wave the reflection is; mismatch loss says how much power the
        load does not receive because of the reflection, with a matched (<i>Z</i>
        <sub>0</sub>) source. A load with <i>R</i> = 0 (short, open or pure reactance) reflects everything: |Γ| = 1, VSWR and ML are infinite and RL is 0 dB. A perfect match gives |Γ| = 0,
        VSWR = 1, ML = 0 dB and an infinite return loss.
      </p>
      <p>
        <b>Sign convention.</b> Return loss is a positive number of decibels. A network analyser displays the same quantity as S11 = 20 log₁₀|Γ|, which is negative. A negative value typed as
        return loss is therefore read as S11 and its sign dropped; the result table shows both.
      </p>
      <p>
        Each quantity is converted with 1 − |Γ|² formed directly from the input (for example 4·VSWR/(VSWR + 1)² or 4<i>RZ</i>
        <sub>0</sub>/|<i>Z</i>
        <sub>L</sub> + <i>Z</i>
        <sub>0</sub>|²), so very good and very poor matches keep full precision.
      </p>
      <h2>Mismatch between a source and a load</h2>
      <p>
        When the source is also mismatched (reflection coefficient Γ<sub>s</sub>), the re-reflected wave adds to the incident one with a phase that is usually unknown. The power the load
        receives from a source with available power <i>P</i>
        <sub>avs</sub> is the transducer gain of a perfect through connection (Pozar §12.1 with <i>S</i>
        <sub>21</sub> = 1, <i>S</i>
        <sub>11</sub> = <i>S</i>
        <sub>22</sub> = 0):
      </p>
      <div className="eq">
        <span className="no">(4)</span>
        <i>P</i>
        <sub>L</sub> / <i>P</i>
        <sub>avs</sub> = (1 − |Γ<sub>s</sub>|²)(1 − |Γ<sub>l</sub>|²) / |1 − Γ<sub>s</sub>Γ<sub>l</sub>|²
      </div>
      <p>
        Over every phase, |1 − Γ<sub>s</sub>Γ<sub>l</sub>| lies between 1 − |Γ<sub>s</sub>||Γ<sub>l</sub>| and 1 + |Γ<sub>s</sub>||Γ<sub>l</sub>|. Relative to the same load fed from a
        matched source, the delivered power therefore lies between
      </p>
      <div className="eq">
        <span className="no">(5)</span>−20 log₁₀(1 + |Γ<sub>s</sub>||Γ<sub>l</sub>|) and −20 log₁₀(1 − |Γ<sub>s</sub>||Γ<sub>l</sub>|) dB
      </div>
      <p>
        This is the mismatch uncertainty of a power measurement (Fluke states it as a power error of 1 − 1/(1 ± |Γ<sub>s</sub>||Γ<sub>l</sub>|)²). The total mismatch loss of (4) is the
        sum of both single-port mismatch losses plus 20 log₁₀ of the same two limits; it reaches 0 dB when the two reflections cancel (Γ<sub>s</sub> = Γ<sub>l</sub>*). Measuring the
        complex Γ of both ports, for example with a vector network analyser, replaces the range by a single value.
      </p>
      <h2>Cascaded VSWR</h2>
      <p>
        A lossless two-port, such as an impedance step or a connector, maps the reflection coefficient behind it onto its input by a bilinear transformation that keeps the unit circle (Pozar
        §2.4, §4.3). With the phase between the two mismatches unknown, the input reflection coefficient lies between
      </p>
      <div className="eq">
        <span className="no">(6)</span>(|Γ<sub>1</sub>| − |Γ<sub>2</sub>|) / (1 − |Γ<sub>1</sub>||Γ<sub>2</sub>|) and (|Γ<sub>1</sub>| + |Γ<sub>2</sub>|) / (1 + |Γ<sub>1</sub>||Γ<sub>2</sub>|)
      </div>
      <p>
        which in VSWR is exactly VSWR<sub>high</sub> / VSWR<sub>low</sub> to VSWR<sub>1</sub> · VSWR<sub>2</sub>. The tests check this against a phase sweep of a load behind an impedance
        step. Loss between the two discontinuities narrows the range; further discontinuities widen it, by the same product rule.
      </p>
      <h2>References</h2>
      <ol>
        <li>
          D. M. Pozar, <i>Microwave Engineering</i>, 4th ed., Wiley, 2012: §2.3 (terminated lossless line, Γ, SWR, return loss), §2.4 (Smith chart), §2.6 (generator and load
          mismatches), §4.3 (scattering matrix) and §12.1 (two-port power gains).
        </li>
      </ol>
      <Sources items={SOURCES} />
    </>
  );
}
