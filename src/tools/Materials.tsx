import { Link } from 'react-router-dom';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { NumField, Panel, Section } from '../components/ui';
import { FOILS, HURAY_SR, hurayRadius, LAMINATE_SOURCES, LAMINATES, MASKS, type Laminate } from '../data/laminates';
import { djordjevicSarkar } from '../lib/dielectric';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { f: 5 };
const CLASSES = [...new Set(LAMINATES.map((l) => l.cls))];

export default function Materials() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const f = p.f > 0 && p.f <= 200 ? p.f : NaN;
  const at = (l: Laminate) => {
    const m = djordjevicSarkar({ dk: l.dk, df: l.df, f0: l.fGHz * 1e9 });
    return Number.isFinite(f) ? { dk: m.dk(f * 1e9), df: m.df(f * 1e9) } : null;
  };
  const properties = (
    <Section title="Frequency">
      <NumField label="Evaluate at" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" hint="Dk and Df are extended from the datasheet frequency with the Djordjevic–Sarkar model." />
      {!Number.isFinite(f) && <p className="text-[var(--err-line)]">Enter a frequency between 0 and 200 GHz.</p>}
    </Section>
  );
  const table = (rows: Laminate[]) => (
    <table className="tbl">
      <thead>
        <tr>
          <th>Material</th>
          <th className="v">Dk</th>
          <th className="v">Df</th>
          <th className="v">at</th>
          <th className="v">Dk @ {fmt(p.f, 4)} GHz</th>
          <th className="v">Df @ {fmt(p.f, 4)} GHz</th>
          <th className="v">Tg</th>
          <th>Datasheet construction</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => {
          const a = at(l);
          return (
            <tr key={l.id}>
              <td>
                {l.vendor} {l.name}
              </td>
              <td className="v">{l.dk}</td>
              <td className="v">{l.df}</td>
              <td className="v">{l.fGHz} GHz</td>
              <td className="v">{a ? fmt(a.dk, 3) : '—'}</td>
              <td className="v">{a ? fmt(a.df, 3) : '—'}</td>
              <td className="v">{l.tg ? `${l.tg} °C` : '—'}</td>
              <td className="text-muted">{l.note}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <ToolPage
      title="PCB Laminate Materials (Dk / Df)"
      description="Dielectric constant (Dk) and dissipation factor (Df) of PCB laminates from the manufacturers' datasheets: standard FR-4, mid-, low- and ultra-low-loss materials and RF laminates, evaluated at any frequency, plus solder masks and copper foil roughness."
      onReset={reset}
      properties={properties}
      status={`${LAMINATES.length} laminates · ${MASKS.length} solder masks · ${FOILS.length} copper foils`}
      method={<Method />}
    >
      <div className="space-y-3">
        {CLASSES.map((c) => (
          <Panel key={c} title={c}>
            {table(LAMINATES.filter((l) => l.cls === c))}
          </Panel>
        ))}
        <Panel title="Solder Masks">{table(MASKS)}</Panel>
        <Panel title="Copper Foil Roughness">
          <table className="tbl">
            <thead>
              <tr>
                <th>Foil</th>
                <th className="v">Rq (RMS)</th>
                <th className="v">Rz</th>
                <th className="v">Huray radius</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {FOILS.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className="v">{fmt(x.rq, 3)} µm</td>
                  <td className="v">{fmt(x.rz, 3)} µm</td>
                  <td className="v">{fmt(hurayRadius(x.rz), 3)} µm</td>
                  <td className="text-muted">{x.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2.5 py-2 text-faint">
            Measured values are shown as published; the other of Rq/Rz follows from Rz ≈ 2√3·Rq. Huray radius 0.06·Rz and surface ratio {fmt(HURAY_SR, 3)} follow the Cannonball-Huray
            model. Use these in the <Link to="/trace-loss">trace loss calculator</Link>.
          </p>
        </Panel>
      </div>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>About the data</h2>
      <p>
        Every Dk and Df value comes from the manufacturer's own datasheet, at the frequency and test method it states. Dk and Df of glass-reinforced laminates depend on the glass style
        and resin content: a resin-rich 1080 prepreg has a noticeably lower Dk than a 7628 core of the same material. Where a datasheet gives a construction table, the library names
        the construction used; for a real design, ask your fabricator for the values of the exact prepregs and cores in your stackup.
      </p>
      <p>
        Test methods differ (IPC-TM-650 2.5.5.5 stripline, 2.5.5.9 parallel plate, split-post resonator, Bereskin stripline, balanced-type circular disk resonator), and results from
        different methods are not exactly comparable. Rogers lists a <i>design Dk</i> for circuit design, which the library uses; the process Dk in the note is the QC value.
      </p>
      <h2>Frequency model</h2>
      <p>
        The columns at the chosen frequency use the Djordjevic–Sarkar wideband Debye model fitted to the datasheet point. It is causal, keeps Df nearly flat and lets Dk fall slowly
        with frequency. Against datasheets that list several frequencies it stays within 1.5 % in Dk from 1 to 10 GHz. Materials whose Df rises steeply with frequency (for example
        Megtron 6, 0.002 at 1 GHz and 0.004 at 10 GHz) are listed at the higher frequency.
      </p>
      <Sources items={LAMINATE_SOURCES} />
    </>
  );
}
