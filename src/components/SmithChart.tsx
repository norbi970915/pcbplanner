import { useId, type ReactNode } from 'react';
import type { Cx } from '../lib/matching';

export interface SmithTrace {
  /** reflection coefficients along the path */
  points: Cx[];
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
}

export interface SmithMarker {
  g: Cx;
  color: string;
  shape?: 'dot' | 'ring' | 'square';
  label?: string;
  title?: string;
}

const R_VALUES = [0.2, 0.5, 1, 2, 5];
const X_VALUES = [0.2, 0.5, 1, 2, 5];

/**
 * Impedance Smith chart drawn from Γ = (z − 1)/(z + 1): constant-r circles have centre r/(1 + r) and
 * radius 1/(1 + r); constant-x circles have centre 1 + j/x and radius 1/|x| (clipped to |Γ| ≤ 1).
 * The admittance grid is the same family rotated by 180°, because Γ = (1 − y)/(1 + y).
 */
export function SmithChart({ traces, markers, admittance = false, label, children }: { traces: SmithTrace[]; markers: SmithMarker[]; admittance?: boolean; label: string; children?: ReactNode }) {
  const clip = useId();
  const S = 400, C = S / 2, R = 170;
  const X = (g: Cx) => C + R * g.re;
  const Y = (g: Cx) => C - R * g.im;
  const path = (pts: Cx[]) => pts.map((g, i) => `${i ? 'L' : 'M'}${X(g).toFixed(2)},${Y(g).toFixed(2)}`).join(' ');

  const grid = (stroke: string, dash?: string) => (
    <g fill="none" stroke={stroke} strokeWidth={0.8} strokeDasharray={dash}>
      {R_VALUES.map((r) => <circle key={`r${r}`} cx={C + (R * r) / (1 + r)} cy={C} r={R / (1 + r)} />)}
      {X_VALUES.flatMap((x) => [x, -x]).map((x) => <circle key={`x${x}`} cx={C + R} cy={C - R / x} r={R / Math.abs(x)} clipPath={`url(#${clip})`} />)}
      <line x1={C - R} x2={C + R} y1={C} y2={C} />
    </g>
  );

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="block h-auto w-full max-w-[460px]" role="img" aria-label={label}>
      <defs>
        <clipPath id={clip}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} fill="var(--field)" stroke="var(--line-strong)" strokeWidth={1.2} />
      {admittance && <g transform={`rotate(180 ${C} ${C})`} opacity={0.7}>{grid('var(--faint)', '3 3')}</g>}
      {grid('var(--line-strong)')}
      {/* r = 1 and g = 1 circles: the two circles every L-section path ends on */}
      <circle cx={C + R / 2} cy={C} r={R / 2} fill="none" stroke="var(--muted)" strokeWidth={1.2} />
      {admittance && <circle cx={C - R / 2} cy={C} r={R / 2} fill="none" stroke="var(--muted)" strokeWidth={1.2} strokeDasharray="5 3" />}
      <g fontSize={10} fill="var(--faint)">
        {R_VALUES.map((r) => (
          <text key={`lr${r}`} x={C + (R * (r - 1)) / (r + 1) + 2} y={C - 3}>
            {r}
          </text>
        ))}
        {X_VALUES.flatMap((x) => [x, -x]).map((x) => {
          // z = jx sits on the rim at Γ = (jx − 1)/(jx + 1), angle π − 2 atan x
          const a = Math.PI - 2 * Math.atan(x);
          return (
            <text key={`lx${x}`} x={C + (R + 12) * Math.cos(a)} y={C - (R + 12) * Math.sin(a) + 3} textAnchor="middle">
              {x > 0 ? `j${x}` : `−j${-x}`}
            </text>
          );
        })}
        <text x={C - R - 4} y={C + 3} textAnchor="end">0</text>
        <text x={C + R + 4} y={C + 3}>∞</text>
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {traces.map((t, i) => (
          <path key={i} d={path(t.points)} stroke={t.color} strokeWidth={t.width ?? 2} strokeDasharray={t.dash} opacity={t.opacity ?? 1} />
        ))}
      </g>
      {markers.map((m, i) => {
        const x = X(m.g), y = Y(m.g);
        return (
          <g key={i}>
            {m.title && <title>{m.title}</title>}
            {m.shape === 'square' ? (
              <rect x={x - 4.5} y={y - 4.5} width={9} height={9} fill={m.color} stroke="var(--sheet)" strokeWidth={1.5} />
            ) : m.shape === 'ring' ? (
              <circle cx={x} cy={y} r={6} fill="none" stroke={m.color} strokeWidth={2} />
            ) : (
              <circle cx={x} cy={y} r={4} fill={m.color} stroke="var(--sheet)" strokeWidth={1.5} />
            )}
            {m.label && (
              <text x={x + 8} y={y - 7} fontSize={11} fill="var(--ink)">
                {m.label}
              </text>
            )}
          </g>
        );
      })}
      {children}
    </svg>
  );
}
