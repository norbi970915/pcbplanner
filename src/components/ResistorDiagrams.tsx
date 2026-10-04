import { useState } from 'react';
import { DiagramSvg, DiagramValues, EngineeringDiagram } from './EngineeringDiagram';
import { Segmented } from './ui';
import type { divider } from '../lib/electronics';
import { fmt, si } from '../lib/units';

export function VoltageDividerDiagram({ vin, r1, r2, load, result }: {
  vin: number; r1: number; r2: number; load: number; result: ReturnType<typeof divider>;
}) {
  const loaded = load > 0;
  return <EngineeringDiagram
    caption={loaded ? 'RL is connected in parallel with R2. The output voltage includes the load.' : 'R1 connects the input to Vout; R2 connects Vout to ground. No load is connected.'}
    legend={[{ label: 'R1 \u00b7 Top resistor', color: 'var(--copper)' }, { label: 'R2 \u00b7 Bottom resistor', color: 'var(--accent-ink)' }, ...(loaded ? [{ label: 'RL \u00b7 Output load', color: 'var(--muted)' }] : [])]}
  >
    <DiagramSvg viewBox="0 0 560 330" label={'Live voltage divider: input ' + si(vin, 'V') + ', R1 ' + si(r1, '\u03a9') + ', R2 ' + si(r2, '\u03a9') + ', output ' + si(result.vout, 'V') + (loaded ? ', load ' + si(load, '\u03a9') : ', unloaded')}>
      {paint => <>
        <g fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M200 50V86 M200 134V207 M200 255V285 M200 50H245 M200 170H480" />
          <rect x="188" y="86" width="24" height="48" rx="3" fill={paint.copper} stroke="var(--copper)" />
          <rect x="188" y="207" width="24" height="48" rx="3" fill="var(--sheet)" stroke="var(--accent-ink)" strokeWidth="2.5" />
          {loaded && <g data-divider-load="connected"><path d="M390 170V207 M390 255V275H200" /><rect x="378" y="207" width="24" height="48" rx="3" fill="var(--panel)" stroke="var(--muted)" /></g>}
          <path d="M185 285H215 M190 293H210 M195 301H205" />
        </g>
        <circle cx="200" cy="50" r="4" fill="var(--copper)" /><circle cx="200" cy="170" r="4" fill="var(--accent-ink)" />
        {loaded && <><circle cx="390" cy="170" r="3" fill="var(--muted)" /><circle cx="200" cy="275" r="3" fill="var(--ink)" /></>}
        <g className="diagram-label">
          <text x="262" y="44">Vin</text><text x="262" y="68">{si(vin, 'V')}</text>
          <text x="155" y="104" textAnchor="end">R1</text><text x="155" y="128" textAnchor="end">{si(r1, '\u03a9')}</text>
          <text x="155" y="225" textAnchor="end">R2</text><text x="155" y="249" textAnchor="end">{si(r2, '\u03a9')}</text>
          <text x="300" y="133">Vout</text><text x="300" y="157">{si(result.vout, 'V')}</text>
          {loaded && <><text x="430" y="225">RL</text><text x="430" y="249">{si(load, '\u03a9')}</text></>}
          <text x="200" y="321" textAnchor="middle">GND</text>
        </g>
      </>}
    </DiagramSvg>
    <DiagramValues items={[{ label: 'Vout / Vin', value: fmt(result.ratio, 5) }, { label: 'R1 \u00b7 Current', value: si(result.current, 'A') }]} />
  </EngineeringDiagram>;
}

interface LedPoint { label: string; r: number; current: number; pR: number; }
export function LedResistorDiagram({ supply, forward, count, drop, values }: {
  supply: number; forward: number; count: number; drop: number;
  values: { exact: LedPoint; nearest: LedPoint; higher: LedPoint };
}) {
  const [choice, setChoice] = useState<'exact' | 'nearest' | 'higher'>('higher');
  const selected = values[choice], compact = count > 3;
  const centres = compact ? [110, 240] : count === 1 ? [170] : count === 2 ? [115, 225] : [105, 175, 245];
  return <>
    <div className="power-stage-controls"><span className="text-muted">Show resistor</span><Segmented label="LED resistor value" value={choice} onChange={setChoice} options={[{ value: 'exact', label: 'Exact' }, { value: 'nearest', label: 'Nearest' }, { value: 'higher', label: 'Next higher' }]} /></div>
    <EngineeringDiagram
      caption={'Shown: ' + selected.label + ' resistor. Current and dissipation use this value. ' + (compact ? 'The first and last symbols represent the ' + fmt(count, 5) + '-LED series string.' : 'Each LED uses the entered forward voltage.')}
      legend={[{ label: 'R \u00b7 Series resistor', color: 'var(--copper)' }, { label: 'LED \u00b7 Forward path', color: 'var(--accent-ink)' }]}
    >
      <DiagramSvg viewBox="0 0 560 330" label={'Live LED circuit: ' + si(supply, 'V') + ' supply, ' + fmt(count, 5) + ' LEDs in series at ' + si(forward, 'V') + ' each, ' + selected.label + ' resistor ' + si(selected.r, '\u03a9') + ', current ' + si(selected.current, 'A')}>
        {paint => <>
          <g fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M65 60H166 M214 60H425 M65 60V145 M65 195V275H425 M245 275V285 M230 285H260 M235 293H255 M240 301H250" />
            <rect x="166" y="48" width="48" height="24" rx="3" fill={paint.copper} stroke="var(--copper)" />
            <circle cx="65" cy="170" r="25" fill="var(--sheet)" /><path d="M58 162H72 M65 155V169 M58 181H72" />
            <path d={'M425 60V' + (centres[0] - 24) + ' M425 ' + (centres.at(-1)! + 24) + 'V275'} />
            {compact ? <><path d="M425 134V155 M425 195V216" /><circle cx="425" cy="166" r="1.5" fill="var(--muted)" /><circle cx="425" cy="175" r="1.5" fill="var(--muted)" /><circle cx="425" cy="184" r="1.5" fill="var(--muted)" /></> : centres.slice(1).map((y, i) => <path key={y} d={'M425 ' + (centres[i] + 24) + 'V' + (y - 24)} />)}
            {centres.map((y, i) => <g key={y} data-led-symbol={compact && i === 1 ? 'last' : i + 1}>
              <path d={'M425 ' + (y - 24) + 'V' + (y - 10) + ' M425 ' + (y + 12) + 'V' + (y + 24)} />
              <path d={'M413 ' + (y - 10) + 'H437L425 ' + (y + 8) + 'Z M411 ' + (y + 12) + 'H439'} fill="var(--sheet)" stroke="var(--accent-ink)" />
              <path d={'M445 ' + (y - 3) + 'L462 ' + (y - 20) + ' M454 ' + (y + 6) + 'L471 ' + (y - 11)} stroke="var(--accent-ink)" strokeWidth="1.4" markerEnd={paint.arrow} />
            </g>)}
          </g>
          <path d="M302 88H366" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" markerEnd={paint.arrow} />
          <g className="diagram-label" textAnchor="middle">
            <text x="190" y="33">R</text><text x="190" y="103">{si(selected.r, '\u03a9')}</text>
            <text x="105" y="149" textAnchor="start">Vs</text><text x="105" y="173" textAnchor="start">{si(supply, 'V')}</text>
            <text x="334" y="113">{si(selected.current, 'A')}</text>
            <text x="245" y="321">GND</text>
            {centres.map((y, i) => <g key={y}><text x="505" y={y + 6}>{compact && i === 1 ? 'LEDn' : 'LED' + (i + 1)}</text><text x="505" y={y + 29} className="diagram-note">{si(forward, 'V')}</text></g>)}
          </g>
        </>}
      </DiagramSvg>
      <DiagramValues items={[{ label: 'R \u00b7 Voltage drop', value: si(drop, 'V') }, { label: 'R \u00b7 Dissipation', value: si(selected.pR, 'W') }]} />
    </EngineeringDiagram>
  </>;
}
