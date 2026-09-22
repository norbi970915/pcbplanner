import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section, Segmented } from '../components/ui';
import { apertureSE, cavityModes, gridCellResonance, wavelengthMm } from '../lib/stitching';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { fmode: 'f', fmax: 5, tr: 100, er: 4.2, pitch: 3, via: 0.6, a: 100, b: 80 };

export default function ViaStitching() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (p.fmode === 'f' && !(p.fmax > 0 && p.fmax <= 300)) errors.push('Frequency must be between 0 and 300 GHz.');
  if (p.fmode === 'tr' && !(p.tr > 0)) errors.push('Rise time must be greater than 0.');
  if (!(p.er >= 1 && p.er <= 100)) errors.push('εr must be between 1 and 100.');
  if (!(p.pitch > 0)) errors.push('Via pitch must be greater than 0.');
  if (!(p.via >= 0 && p.via < p.pitch)) errors.push('The via pad must be smaller than the pitch.');
  if (!(p.a > 0 && p.b > 0)) errors.push('Board dimensions must be greater than 0.');
  // knee frequency 0.5/tr (Johnson & Graham) when the rise time is given
  const f = p.fmode === 'f' ? p.fmax * 1e9 : 0.5 / (p.tr * 1e-12);
  const ok = !errors.length;
  const lam = ok ? wavelengthMm(f, p.er) : NaN;
  const lam0 = ok ? wavelengthMm(f, 1) : NaN;
  const cell = ok ? gridCellResonance(p.pitch, p.er) : NaN;
  const gap = p.pitch - p.via;
  const se = ok ? apertureSE(gap, f, 1) : NaN;
  const modes = ok ? cavityModes(p.a, p.b, p.er, Math.max(f * 1.5, 1e8), 10) : [];
  const notes: string[] = [];
  if (ok) {
    if (cell < 2 * f) notes.push(`The via-grid cell resonates at ${si(cell, 'Hz', 3)}, less than twice the highest frequency. Reduce the pitch.`);
    if (p.pitch > lam / 10) notes.push(`The pitch is more than λ/10 (${fmt(lam / 10, 3)} mm) at ${si(f, 'Hz', 3)}.`);
  }

  const properties = (
    <>
      <Section title="Frequency">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">From</span>
          <Segmented
            label="Frequency from"
            value={p.fmode as 'f' | 'tr'}
            onChange={(v) => set({ fmode: v })}
            options={[
              { value: 'f', label: 'Frequency' },
              { value: 'tr', label: 'Rise time' },
            ]}
          />
        </div>
        {p.fmode === 'f' ? (
          <NumField label="Highest frequency" symbol="fmax" value={p.fmax} onChange={(v) => set({ fmax: v })} unit="GHz" hint="Highest frequency to contain: a clock harmonic, an RF band or the knee frequency." />
        ) : (
          <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" hint="Knee frequency = 0.5 / tr." />
        )}
        <NumField label="Laminate εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
      </Section>
      <Section title="Stitching Vias">
        <LenField label="Via pitch" symbol="s" value={p.pitch} onChange={(v) => set({ pitch: v })} units={['mm', 'mil', 'in']} />
        <LenField label="Via pad diameter" value={p.via} onChange={(v) => set({ via: v })} units={['mm', 'mil']} allowZero />
      </Section>
      <Section title="Plane Pair (board)">
        <LenField label="Length" symbol="a" value={p.a} onChange={(v) => set({ a: v })} units={['mm', 'in']} />
        <LenField label="Width" symbol="b" value={p.b} onChange={(v) => set({ b: v })} units={['mm', 'in']} />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Via Stitching & Via Fence Spacing"
      description="Stitching-via and via-fence spacing from the wavelength in the laminate (λ/10, λ/20), the resonance of the via-grid cell, the leakage through the gaps between vias, and the cavity resonances of an unstitched plane pair."
      onReset={reset}
      properties={properties}
      status={ok ? `f = ${si(f, 'Hz', 3)} · λ = ${fmt(lam, 4)} mm · λ/20 = ${fmt(lam / 20, 3)} mm · cell resonance ${si(cell, 'Hz', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title={`Spacing at ${si(f, 'Hz', 3)}`}>
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="λ/20 (conservative)" value={fmt(lam / 20, 3)} unit="mm" />
              <Big label="λ/10" value={fmt(lam / 10, 3)} unit="mm" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Wavelength in the laminate" value={fmt(lam, 4)} unit="mm" sub={`free space ${fmt(lam0, 4)} mm`} />
                <Result label="λ/4 (absolute limit, a slot resonates at λ/2)" value={fmt(lam / 4, 4)} unit="mm" />
                {p.fmode === 'tr' && <Result label="Knee frequency" value={si(f, 'Hz', 3)} sub="0.5 / tr" />}
              </tbody>
            </table>
          </Panel>
          <Panel title={`Your Pitch: ${fmt(p.pitch, 4)} mm`}>
            <table className="tbl">
              <tbody>
                <Result label="Pitch in wavelengths" value={`λ/${fmt(lam / p.pitch, 3)}`} strong />
                <Result label="Via-grid cell resonance" value={si(cell, 'Hz', 3)} sub="lowest (TM11) mode of a square cell between plane pairs" />
                <Result label="Gap between via pads" value={fmt(gap, 4)} unit="mm" />
                <Result label="Leakage through each gap" value={`${fmt(se, 3)} dB`} sub="shielding estimate of one gap as a slot in air: 20·log(λ/2L)" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Unstitched Plane-Pair Resonances" className="xl:col-span-2">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Mode (m, n)</th>
                  <th className="v">Frequency</th>
                  <th className="v">vs. f</th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={`${m.m}-${m.n}`}>
                    <td>
                      TM{m.m}
                      {m.n}
                    </td>
                    <td className="v">{si(m.f, 'Hz', 4)}</td>
                    <td className="v">{m.f <= f ? 'below f: needs stitching or decoupling' : 'above f'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2.5 py-2 text-faint">
              A bare {fmt(p.a, 4)} × {fmt(p.b, 4)} mm plane pair with open edges resonates at these frequencies. Stitching vias between the planes (and decoupling capacitors for
              power/ground pairs) suppress the modes below the highest frequency.
            </p>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Why the spacing matters</h2>
      <p>
        Stitching vias tie ground planes together so that return currents can change layers and so that the space between the planes cannot resonate. A via fence along a trace or
        the board edge acts as a wall. Both work only if the vias are close compared with the wavelength inside the laminate:
      </p>
      <div className="eq">
        <span className="no">(1)</span>λ = <i>c</i> / (<i>f</i> √ε<sub>r</sub>)
      </div>
      <p>
        λ/20 is the common conservative rule for stitching and fences, and λ/10 is often accepted. These are design guidelines, not requirements of a standard. The tool also gives
        two physics-based checks:
      </p>
      <h3>Via-grid cell resonance</h3>
      <p>
        Two planes stitched on a square grid form cavities between the vias. Treating each via row as a wall, the lowest mode of a cell of pitch <i>s</i> is:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>11</sub> = <i>c</i> √2 / (2 <i>s</i> √ε<sub>r</sub>)
      </div>
      <p>Real via rows leak, so the actual resonance is somewhat lower. Keep it well above the highest frequency; the tool warns below 2×.</p>
      <h3>Unstitched plane pair</h3>
      <p>A rectangular plane pair with open edges resonates at:</p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>f</i>
        <sub>mn</sub> = <i>c</i> / (2√ε<sub>r</sub>) · √((<i>m</i>/<i>a</i>)² + (<i>n</i>/<i>b</i>)²)
      </div>
      <h3>Leakage between vias</h3>
      <p>
        The gap between two via pads behaves like a slot. Its shielding effectiveness is roughly 20·log<sub>10</sub>(λ/2<i>L</i>), which is zero when the slot is half a wavelength long.
        Treat this as an order-of-magnitude estimate: it assumes a single slot in a perfect wall.
      </p>
      <h2>References</h2>
      <ol>
        <li>H. W. Ott, <i>Electromagnetic Compatibility Engineering</i>, Wiley, 2009, chapter 6 (apertures).</li>
        <li>M. Swaminathan, A. E. Engin, <i>Power Integrity Modeling and Design for Semiconductors and Systems</i>, Prentice Hall, 2007 (plane-pair cavity model).</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993 (knee frequency 0.5/tr).</li>
      </ol>
    </>
  );
}
