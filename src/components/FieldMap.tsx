import { useEffect, useRef } from 'react';
import type { FieldMap as FieldData, Geometry } from '../lib/fieldsolver';

function locate(arr: number[], v: number) {
  let lo = 0;
  let hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

function readVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const i = Number.parseInt(n, 16);
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
}

/**
 * Equipotential plot of the solved field (full cross-section, mirrored from
 * the half-domain solution). Bands of 1/10 of the drive voltage.
 */
export function FieldMap({ field, geom }: { field: FieldData; geom: Geometry }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cssW = cv.clientWidth || 520;
    const { x, y, phi, nx } = field;
    const odd = field.mode === 'odd';
    const xEdge = geom.diff ? (geom.s ?? 0) / 2 + geom.w : geom.w / 2;
    const hRef = geom.yTrace;
    const ytop = geom.yTrace + geom.t;
    const open = geom.topPlane === undefined;

    // viewing window: the conductors plus a few dielectric heights of fringe field
    let yMax = open ? ytop + 2.5 * Math.max(hRef, 2 * geom.t) : (geom.topPlane as number);
    let xMax = xEdge + (geom.coplanarGap ?? 0) + Math.max(3 * hRef, 0.4 * xEdge);
    let cssH = (cssW * yMax) / (2 * xMax);
    if (cssH > 380) {
      cssH = 380;
      xMax = (yMax * cssW) / (2 * cssH);
    } else if (cssH < 170) {
      cssH = 170;
      if (open) yMax = (cssH * 2 * xMax) / cssW;
      else xMax = (yMax * cssW) / (2 * cssH);
    }
    xMax = Math.min(xMax, x[x.length - 1]);
    yMax = Math.min(yMax, y[y.length - 1]);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = `${Math.round(cssH)}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const scale = Math.min(cv.width / (2 * xMax), cv.height / yMax);
    const ox = cv.width / 2;
    const oy = cv.height - (cv.height - yMax * scale) / 2;

    const pos = hexToRgb(readVar('--copper', '#c7702f'));
    const neg: [number, number, number] = [59, 111, 182];
    const bg = hexToRgb(readVar('--panel', '#ffffff'));
    const img = ctx.createImageData(cv.width, cv.height);
    const data = img.data;

    for (let py = 0; py < cv.height; py++) {
      const yy = (oy - py) / scale;
      const inY = yy >= 0 && yy <= y[y.length - 1];
      const j = inY ? locate(y, yy) : 0;
      const ty = inY ? (yy - y[j]) / (y[j + 1] - y[j]) : 0;
      for (let px = 0; px < cv.width; px++) {
        const o = (py * cv.width + px) * 4;
        const xx = (px - ox) / scale;
        const ax = Math.abs(xx);
        let v = 0;
        if (inY && ax <= x[x.length - 1]) {
          const i = locate(x, ax);
          const tx = (ax - x[i]) / (x[i + 1] - x[i]);
          const k = j * nx + i;
          v =
            phi[k] * (1 - tx) * (1 - ty) +
            phi[k + 1] * tx * (1 - ty) +
            phi[k + nx] * (1 - tx) * ty +
            phi[k + nx + 1] * tx * ty;
          if (odd && xx < 0) v = -v;
        }
        const a = Math.min(1, Math.abs(v));
        const band = Math.floor(a * 10);
        const shade = (band % 2 === 0 ? 0.85 : 1) * (0.15 + 0.75 * a);
        const c = v >= 0 ? pos : neg;
        data[o] = bg[0] + (c[0] - bg[0]) * shade;
        data[o + 1] = bg[1] + (c[1] - bg[1]) * shade;
        data[o + 2] = bg[2] + (c[2] - bg[2]) * shade;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // outlines: conductors, dielectric surface, planes
    const X = (mm: number) => ox + mm * scale;
    const Y = (mm: number) => oy - mm * scale;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = readVar('--ink', '#1f2328');
    ctx.fillStyle = readVar('--copper', '#c7702f');
    const wTop = geom.wTop ?? geom.w;
    const drawTrace = (xl: number, xr: number) => {
      const e = (geom.w - wTop) / 2;
      ctx.beginPath();
      ctx.moveTo(X(xl), Y(geom.yTrace));
      ctx.lineTo(X(xr), Y(geom.yTrace));
      ctx.lineTo(X(xr - e), Y(ytop));
      ctx.lineTo(X(xl + e), Y(ytop));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    if (geom.diff) {
      const s = geom.s ?? 0;
      drawTrace(s / 2, s / 2 + geom.w);
      drawTrace(-s / 2 - geom.w, -s / 2);
    } else drawTrace(-geom.w / 2, geom.w / 2);
    if (geom.coplanarGap) {
      const g0 = xEdge + geom.coplanarGap;
      ctx.fillRect(X(g0), Y(ytop), X(xMax) - X(g0), Y(geom.yTrace) - Y(ytop));
      ctx.fillRect(X(-xMax), Y(ytop), X(-g0) - X(-xMax), Y(geom.yTrace) - Y(ytop));
    }
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    for (const sl of geom.slabs) {
      ctx.beginPath();
      ctx.moveTo(X(-xMax), Y(sl.y1));
      ctx.lineTo(X(xMax), Y(sl.y1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillRect(X(-xMax), Y(0) - 3 * dpr, X(xMax) - X(-xMax), 3 * dpr);
    if (geom.topPlane !== undefined) ctx.fillRect(X(-xMax), Y(geom.topPlane) - 3 * dpr, X(xMax) - X(-xMax), 3 * dpr);
  }, [field, geom]);

  return <canvas ref={ref} className="block w-full rounded-sm" aria-label="Equipotential plot of the electric field" />;
}
