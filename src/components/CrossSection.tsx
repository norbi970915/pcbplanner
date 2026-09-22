import { fmt } from '../lib/units';

export interface XsecSpec {
  type: 'microstrip' | 'embedded' | 'stripline';
  diff: boolean;
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
        .dimtxt{fill:var(--ink);font-size:11px;font-family:var(--font-sans);paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round}
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
