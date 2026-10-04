import { DiagramSvg, DiagramValues, EngineeringDiagram } from './EngineeringDiagram';
import type { FeedbackPair } from '../lib/power';
import { fmt, si } from '../lib/units';

export function FeedbackDividerDiagram({ pair, vfb, ifb, series }: {
  pair: FeedbackPair; vfb: number; ifb: number; series: string;
}) {
  const r1 = si(pair.r1, '\u03a9', 3), r2 = si(pair.r2, '\u03a9', 3);
  const biasShift = ifb * pair.r1;
  return <EngineeringDiagram
    caption={'The regulator holds FB at the reference voltage. R1 connects Vout to FB; R2 connects FB to ground. Shown: the best ' + series + ' pair.'}
    legend={[{ label: 'R1 \u00b7 Output to FB', color: 'var(--copper)' }, { label: 'R2 \u00b7 FB to ground', color: 'var(--accent-ink)' }]}
  >
    <DiagramSvg viewBox="0 0 560 330" label={'Live feedback divider: R1 ' + r1 + ' from output to FB, R2 ' + r2 + ' from FB to ground. Output ' + fmt(pair.vout, 5) + ' V; feedback ' + fmt(vfb, 4) + ' V.'}>
      {paint => <>
        <g fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M230 50V86 M230 134V207 M230 255V285 M230 50H290 M230 170H380" />
          <rect x="218" y="86" width="24" height="48" rx="3" fill={paint.copper} stroke="var(--copper)" />
          <rect x="218" y="207" width="24" height="48" rx="3" fill="var(--sheet)" stroke="var(--accent-ink)" strokeWidth="2.5" />
          <rect x="380" y="142" width="130" height="56" rx="6" fill="var(--panel)" stroke="var(--line-strong)" />
          <path d="M215 285H245 M220 293H240 M225 301H235" />
        </g>
        <circle cx="230" cy="50" r="4" fill="var(--copper)" />
        <circle cx="230" cy="170" r="4" fill="var(--accent-ink)" />
        <g className="diagram-label">
          <text x="307" y="44">Vout</text><text x="307" y="68">{fmt(pair.vout, 5)} V</text>
          <text x="185" y="104" textAnchor="end">R1</text><text x="185" y="128" textAnchor="end">{r1}</text>
          <text x="185" y="225" textAnchor="end">R2</text><text x="185" y="249" textAnchor="end">{r2}</text>
          <text x="288" y="149">{fmt(vfb, 4)} V</text><text x="397" y="175">FB</text>
          <text x="445" y="124" textAnchor="middle">Regulator</text>
          <text x="230" y="321" textAnchor="middle">GND</text>
        </g>
        {ifb !== 0 && <path data-bias-direction={ifb > 0 ? 'into-fb' : 'out-of-fb'} d={ifb > 0 ? 'M285 189H352' : 'M352 189H285'} fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" markerEnd={paint.arrow} />}
        <text className="diagram-note" x="318" y="220" textAnchor="middle">{'IFB = ' + si(ifb, 'A', 3)}</text>
      </>}
    </DiagramSvg>
    <DiagramValues items={[
      { label: 'R2 \u00b7 Divider current', value: si(pair.iDivider, 'A', 4) },
      { label: 'IFB \u00b7 Output shift', value: (biasShift > 0 ? '+' : '') + si(biasShift, 'V', 4) },
    ]} />
  </EngineeringDiagram>;
}
