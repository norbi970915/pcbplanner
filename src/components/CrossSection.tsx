import { fmt } from '../lib/units';

export interface XsecSpec {
  type: 'microstrip' | 'embedded' | 'stripline';
  diff: boolean;
  coupling?: 'edge' | 'broadside';
  w: number;
  wTop: number;
  t: number;
  s: number;
  h: number;
  h2: number;
  er: number;
  er2: number;
  mask: boolean;
  cpw: boolean;
  gap: number;
}

/**
 * Labelled cross-section. Horizontal and vertical proportions are kept
 * roughly realistic but clamped so every feature stays readable.
 */
export function CrossSection({ spec, unitLabel, toUnit }: { spec: XsecSpec; unitLabel: string; toUnit: (mm: number) => number }) {
  if (spec.diff && spec.coupling === 'broadside') return <BroadsideSection spec={spec} unitLabel={unitLabel} toUnit={toUnit} />;
  const V = (mm: number) => `${fmt(toUnit(mm), 3)} ${unitLabel}`;
  const Wd = 520;
  const Hd = 210;
  const cx = Wd / 2;

  // horizontal scale from the widest feature group
  const groupW = spec.diff ? 2 * spec.w + spec.s : spec.w;
  const pxPerMm = Math.min(240 / groupW, 900);
  const wPx = Math.max(34, spec.w * pxPerMm);
  const sPx = spec.diff ? Math.min(Math.max(22, spec.s * pxPerMm), 150) : 0;
  const etchPx = Math.min(wPx * 0.25, Math.max(0, ((spec.w - spec.wTop) / 2) * pxPerMm));
  const gapPx = spec.cpw ? Math.min(Math.max(20, spec.gap * pxPerMm), 90) : 0;

  const vScale = (mm: number) => Math.min(Math.max(mm * pxPerMm * 0.9, 26), 70);
  const tPx = Math.min(Math.max(spec.t * pxPerMm, 6), 12);
  const hPx = vScale(spec.h);
  const h2Px = spec.type === 'microstrip' ? 0 : vScale(spec.h2);

  const planeT = 7;
  const yBottomPlane = Hd - 22;
  const yTraceBottom = yBottomPlane - hPx;
  const yTraceTop = yTraceBottom - tPx;
  const yUpperTop = yTraceTop - h2Px;

  const traces: { x0: number; x1: number }[] = spec.diff
    ? [
        { x0: cx - sPx / 2 - wPx, x1: cx - sPx / 2 },
        { x0: cx + sPx / 2, x1: cx + sPx / 2 + wPx },
      ]
    : [{ x0: cx - wPx / 2, x1: cx + wPx / 2 }];
  const outerL = traces[0].x0;
  const outerR = traces[traces.length - 1].x1;

  const trap = (x0: number, x1: number) =>
    `${x0},${yTraceBottom} ${x1},${yTraceBottom} ${x1 - etchPx},${yTraceTop} ${x0 + etchPx},${yTraceTop}`;

  const dim = (x1: number, x2: number, y: number, label: string, above = true) => (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} className="dimline" markerStart="url(#xa)" markerEnd="url(#xa)" />
      <text x={(x1 + x2) / 2} y={above ? y - 4 : y + 12} textAnchor="middle" className="dimtxt">
        {label}
      </text>
    </g>
  );
  const vdim = (x: number, y1: number, y2: number, label: string, left = false) => (
    <g>
      <line x1={x} x2={x} y1={y1} y2={y2} className="dimline" markerStart="url(#xa)" markerEnd="url(#xa)" />
      <text x={left ? x - 5 : x + 5} y={(y1 + y2) / 2 + 4} textAnchor={left ? 'end' : 'start'} className="dimtxt">
        {label}
      </text>
    </g>
  );

  // crop empty space above the drawing
  const top = spec.type === 'stripline' ? yUpperTop - planeT - 8 : Math.min(yUpperTop, yTraceTop) - 42;

  return (
    <svg viewBox={`0 ${top} ${Wd} ${Hd - top}`} className="h-auto w-full" role="img" aria-label="Cross-section of the transmission line">
      <style>{`
        .dimline{stroke:var(--ink);stroke-width:.8;fill:none}
        .dimtxt{fill:var(--ink);font-size:11px;font-family:var(--font-sans);paint-order:stroke;stroke:var(--sheet);stroke-width:3px;stroke-linejoin:round}
        .sub{fill:var(--muted);font-size:10.5px;font-family:var(--font-sans)}
      `}</style>
      <defs>
        <marker id="xa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--ink)" />
        </marker>
      </defs>

      {/* dielectric below the trace */}
      <rect x={10} y={yTraceBottom} width={Wd - 20} height={hPx} fill="var(--laminate)" />
      <text x={16} y={yBottomPlane - 6} className="sub">
        εr {fmt(spec.er, 3)}
      </text>
      {/* dielectric above (embedded / stripline) */}
      {spec.type !== 'microstrip' && (
        <>
          <rect x={10} y={yUpperTop} width={Wd - 20} height={h2Px + tPx} fill="var(--prepreg)" />
          <text x={16} y={yUpperTop + 13} className="sub">
            εr {fmt(spec.er2, 3)}
          </text>
        </>
      )}
      {/* solder mask */}
      {spec.type === 'microstrip' && spec.mask && (
        <path
          d={`M10,${yTraceBottom - 5} L${outerL - 5},${yTraceBottom - 5} L${outerL - 5},${yTraceTop - 4} L${outerR + 5},${yTraceTop - 4} L${outerR + 5},${yTraceBottom - 5} L${Wd - 10},${yTraceBottom - 5}`}
          fill="none"
          stroke="var(--mask)"
          strokeWidth={4}
          opacity={0.75}
        />
      )}
      {/* planes */}
      <rect x={10} y={yBottomPlane} width={Wd - 20} height={planeT} fill="var(--copper)" />
      {spec.type === 'stripline' && <rect x={10} y={yUpperTop - planeT} width={Wd - 20} height={planeT} fill="var(--copper)" />}
      {/* coplanar grounds */}
      {spec.cpw && (
        <>
          <rect x={10} y={yTraceTop} width={outerL - gapPx - 10} height={tPx} fill="var(--copper)" />
          <rect x={outerR + gapPx} y={yTraceTop} width={Wd - 10 - outerR - gapPx} height={tPx} fill="var(--copper)" />
        </>
      )}
      {/* traces */}
      {traces.map((tr, i) => (
        <polygon key={i} points={trap(tr.x0, tr.x1)} fill="var(--copper)" stroke="var(--ink)" strokeWidth={0.6} />
      ))}

      {/* dimensions */}
      {dim(traces[0].x0, traces[0].x1, yTraceTop - (spec.mask && spec.type === 'microstrip' ? 16 : 10), `W ${V(spec.w)}`)}
      {spec.diff && dim(traces[0].x1, traces[1].x0, yTraceBottom + 14, `S ${V(spec.s)}`, false)}
      {spec.cpw && dim(outerR, outerR + gapPx, yTraceBottom + 14, `G ${V(spec.gap)}`, false)}
      {vdim(outerR + (spec.cpw ? gapPx / 2 : 28), yTraceBottom, yBottomPlane, `H ${V(spec.h)}`)}
      {vdim(outerL - (spec.cpw ? gapPx / 2 : 24), yTraceTop, yTraceBottom, `T ${V(spec.t)}`, true)}
      {spec.type !== 'microstrip' && vdim(outerR + (spec.cpw ? gapPx / 2 : 28), yUpperTop, yTraceTop, `H2 ${V(spec.h2)}`)}
      <text x={Wd - 12} y={Hd - 4} textAnchor="end" className="sub">
        not to scale
      </text>
    </svg>
  );
}

function BroadsideSection({ spec, unitLabel, toUnit }: { spec: XsecSpec; unitLabel: string; toUnit: (mm: number) => number }) {
  const V = (v: number) => `${fmt(toUnit(v), 3)} ${unitLabel}`;
  const scale = Math.min(200 / Math.max(spec.w, 0.001), 900);
  const width = Math.min(220, Math.max(70, spec.w * scale));
  const x0 = 260 - width / 2, x1 = 260 + width / 2;
  const h = Math.min(65, Math.max(34, spec.h * scale));
  const gap = Math.min(70, Math.max(34, spec.s * scale));
  const t = Math.min(12, Math.max(7, spec.t * scale));
  const etch = Math.min(width / 4, Math.max(0, (spec.w - spec.wTop) / 2 * scale));
  const bottom = 265, lowerBottom = bottom - h, lowerTop = lowerBottom - t;
  const upperBottom = lowerTop - gap, upperTop = upperBottom - t, top = upperTop - h;
  const dim = (x: number, a: number, b: number, label: string, left = false) => <g>
    <line x1={x} x2={x} y1={a} y2={b} className="bs-dim" markerStart="url(#bs-arrow)" markerEnd="url(#bs-arrow)" />
    <text x={x + (left ? -6 : 6)} y={(a+b)/2+4} textAnchor={left ? 'end' : 'start'} className="bs-label">{label}</text>
  </g>;
  return <svg viewBox={`0 ${top - 20} 520 ${bottom - top + 43}`} className="h-auto w-full" role="img" aria-label="Broadside differential pair: two aligned signal layers between ground planes">
    <style>{`.bs-dim{stroke:var(--ink);stroke-width:.8;fill:none}.bs-label{fill:var(--ink);font:11px var(--font-sans);paint-order:stroke;stroke:var(--sheet);stroke-width:3px;stroke-linejoin:round}.bs-sub{fill:var(--muted);font:10.5px var(--font-sans)}@media(max-width:640px){.bs-label{font-size:17px}.bs-sub{font-size:15px}}`}</style>
    <defs><marker id="bs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="var(--ink)" /></marker></defs>
    <rect x={10} y={top} width={500} height={h} fill="var(--laminate)" />
    <rect x={10} y={upperTop} width={500} height={gap+2*t} fill="var(--prepreg)" />
    <rect x={10} y={lowerBottom} width={500} height={h} fill="var(--laminate)" />
    <rect x={10} y={top-7} width={500} height={7} fill="var(--copper)" />
    <rect x={10} y={bottom} width={500} height={7} fill="var(--copper)" />
    <polygon points={`${x0},${lowerBottom} ${x1},${lowerBottom} ${x1-etch},${lowerTop} ${x0+etch},${lowerTop}`} fill="var(--copper)" stroke="var(--ink)" strokeWidth={0.6} />
    <polygon points={`${x0},${upperTop} ${x1},${upperTop} ${x1-etch},${upperBottom} ${x0+etch},${upperBottom}`} fill="var(--copper)" stroke="var(--ink)" strokeWidth={0.6} />
    <text x={16} y={top-10} className="bs-sub">Ground plane</text>
    <text x={16} y={top+h/2} className="bs-sub">Dk {fmt(spec.er,3)}</text>
    <text x={16} y={(lowerTop+upperBottom)/2+4} className="bs-sub">Dk {fmt(spec.er2,3)}</text>
    <text x={16} y={lowerBottom+h/2} className="bs-sub">Dk {fmt(spec.er,3)}</text>
    {dim(x1+24, top, upperTop, `H ${V(spec.h)}`)}
    {dim(x1+24, lowerBottom, bottom, `H ${V(spec.h)}`)}
    {dim(x0-18, upperBottom, lowerTop, `S ${V(spec.s)}`, true)}
    {dim(x1+24, lowerTop, lowerBottom, `T ${V(spec.t)}`)}
    <line x1={x0} x2={x1} y1={bottom+15} y2={bottom+15} className="bs-dim" markerStart="url(#bs-arrow)" markerEnd="url(#bs-arrow)" />
    <text x={260} y={bottom+12} textAnchor="middle" className="bs-label">W {V(spec.w)}</text>
    <text x={508} y={bottom+20} textAnchor="end" className="bs-sub">not to scale</text>
  </svg>;
}
