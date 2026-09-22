import { useMemo } from 'react';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { LenField, Panel, Section, Segmented } from '../components/ui';
import { AWG, copperOhmPerMetre, SOURCES as AWG_SOURCES } from '../data/awg';
import { FRACTIONAL_DRILLS, INCH_DRILLS_SORTED, LETTER_DRILLS, METRIC_DRILLS, nearestDrill, NUMBER_DRILLS, SOURCES as DRILL_SOURCES } from '../data/drills';
import { METRIC_COARSE, SOURCES as THREAD_SOURCES, UNIFIED } from '../data/threads';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

type Chart = 'drills' | 'threads' | 'awg';
const DEFAULTS = { chart: 'drills', find: 0.8, filter: 'all' };

export default function ReferenceCharts() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const chart = p.chart as Chart;
  const nearestInch = nearestDrill(p.find, INCH_DRILLS_SORTED);
  const nearestMetric = nearestDrill(p.find, METRIC_DRILLS);
  const drills = useMemo(() => {
    const all = [...NUMBER_DRILLS, ...LETTER_DRILLS, ...FRACTIONAL_DRILLS, ...METRIC_DRILLS];
    const list = p.filter === 'all' ? all : all.filter((d) => d.kind === p.filter);
    return [...list].sort((a, b) => a.mm - b.mm);
  }, [p.filter]);

  const properties = (
    <>
      <Section title="Chart">
        <Segmented
          label="Chart"
          value={chart}
          onChange={(v) => set({ chart: v })}
          options={[
            { value: 'drills', label: 'Drills' },
            { value: 'threads', label: 'Threads' },
            { value: 'awg', label: 'AWG' },
          ]}
        />
      </Section>
      {chart === 'drills' && (
        <Section title="Find a Drill">
          <LenField label="Wanted diameter" value={p.find} onChange={(v) => set({ find: v })} units={['mm', 'in', 'mil']} />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1 pt-1">
            <span className="text-muted">Nearest inch drill</span>
            <span className="tnum">{nearestInch ? `${nearestInch.name} (${fmt(nearestInch.mm, 4)} mm)` : '—'}</span>
            <span className="text-muted">Nearest metric drill</span>
            <span className="tnum">{nearestMetric ? `${nearestMetric.name}` : '—'}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {[
              ['all', 'All'],
              ['number', 'Number'],
              ['letter', 'Letter'],
              ['fraction', 'Fraction'],
              ['metric', 'Metric'],
            ].map(([k, lbl]) => (
              <button key={k} className={`btn px-1.5 ${p.filter === k ? 'btn-primary' : ''}`} onClick={() => set({ filter: k })}>
                {lbl}
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );

  return (
    <ToolPage
      title="Reference Charts"
      description="Drill sizes (number, letter, fractional and metric), ISO metric and Unified screw threads with tap drills and clearance holes, and the AWG wire table, from verified standard sources."
      onReset={reset}
      properties={properties}
      status={chart === 'drills' ? `${drills.length} drill sizes · nearest to ${fmt(p.find, 4)} mm: ${nearestInch?.name ?? '—'} / ${nearestMetric?.name ?? '—'}` : chart === 'threads' ? `${METRIC_COARSE.length} metric and ${UNIFIED.length} unified threads` : `${AWG.length} AWG sizes`}
      method={<Sources items={chart === 'drills' ? DRILL_SOURCES : chart === 'threads' ? THREAD_SOURCES : AWG_SOURCES} />}
    >
      {chart === 'drills' && (
        <Panel title="Drill Sizes (sorted by diameter)">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="tbl">
              <thead className="sticky top-0">
                <tr>
                  <th>Drill</th>
                  <th>Type</th>
                  <th className="v">Inch</th>
                  <th className="v">mm</th>
                </tr>
              </thead>
              <tbody>
                {drills.map((d) => (
                  <tr key={d.kind + d.name} className={d === nearestInch || d === nearestMetric ? 'sel' : ''}>
                    <td>{d.name}</td>
                    <td className="text-muted">{d.kind}</td>
                    <td className="v">{d.inch.toFixed(4)}</td>
                    <td className="v">{d.mm.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {chart === 'threads' && (
        <div className="grid gap-3 2xl:grid-cols-2">
          <Panel title="ISO Metric Coarse Threads (mm)">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Thread</th>
                    <th className="v">Pitch</th>
                    <th className="v">Tap drill</th>
                    <th className="v">D − P</th>
                    <th className="v">Clearance fine</th>
                    <th className="v">medium</th>
                    <th className="v">coarse</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_COARSE.map((t) => (
                    <tr key={t.name}>
                      <td>
                        {t.name}
                        {t.series === 'R20' && <span className="text-faint"> (2nd choice)</span>}
                      </td>
                      <td className="v">{t.pitch}</td>
                      <td className="v">{t.tapDrill}</td>
                      <td className="v">{fmt(t.tapDrillDminusP, 4)}</td>
                      <td className="v">{t.clearance.fine}</td>
                      <td className="v">{t.clearance.medium}</td>
                      <td className="v">{t.clearance.coarse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Unified Threads (UNC / UNF)">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Thread</th>
                    <th>Series</th>
                    <th className="v">Major (in)</th>
                    <th className="v">TPI</th>
                    <th>Tap drill</th>
                    <th>Close fit</th>
                    <th>Free fit</th>
                  </tr>
                </thead>
                <tbody>
                  {UNIFIED.map((t) => (
                    <tr key={t.name + t.series}>
                      <td>{t.name}</td>
                      <td className="text-muted">{t.series}</td>
                      <td className="v">{t.major.toFixed(4)}</td>
                      <td className="v">{t.tpi}</td>
                      <td>
                        {t.tapDrill.name} <span className="text-faint">({t.tapDrill.inch.toFixed(4)}″)</span>
                      </td>
                      <td>
                        {t.close.name} <span className="text-faint">({t.close.inch.toFixed(4)}″)</span>
                      </td>
                      <td>
                        {t.free.name} <span className="text-faint">({t.free.inch.toFixed(4)}″)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      {chart === 'awg' && (
        <Panel title="AWG Solid Copper Wire (ASTM B258 / NBS Handbook 100)">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="tbl">
              <thead className="sticky top-0">
                <tr>
                  <th>AWG</th>
                  <th className="v">Diameter (in)</th>
                  <th className="v">Diameter (mm)</th>
                  <th className="v">Area (mm²)</th>
                  <th className="v">Area (cmil)</th>
                  <th className="v">Ω/km at 20 °C</th>
                </tr>
              </thead>
              <tbody>
                {AWG.map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td className="v">{a.inch.toFixed(4)}</td>
                    <td className="v">{fmt(a.mm, 4)}</td>
                    <td className="v">{fmt((Math.PI / 4) * a.mm * a.mm, 4)}</td>
                    <td className="v">{fmt(a.cmil, 5)}</td>
                    <td className="v">{fmt(copperOhmPerMetre(a, 20) * 1000, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-2.5 py-1.5 text-faint">
            No ampacity column: published ampacity tables depend on insulation rating, bundling and the code edition (NEC values change between editions), so they are not reproduced. Use the
            wire gauge tool for resistance, voltage drop and fusing current.
          </p>
        </Panel>
      )}
    </ToolPage>
  );
}
