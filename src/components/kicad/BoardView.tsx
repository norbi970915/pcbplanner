// The board view of the KiCad project page: the copper of every visible layer drawn from the board file
// (zone fills, tracks, pads, vias) inside the board outline, with markers where the routing check found
// something. Drawn as vectors on a canvas in board millimetres (KiCad's y axis points down, as the
// canvas's does). Drag or arrow keys pan, the wheel, pinch or +/− zoom, F fits; a click on a marker
// picks it, a click on copper picks its net.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { padPolygon, type BoardDrawing } from '../../lib/kicadDrawing';
import { arcOf } from '../../lib/kicadRouting';

export interface BoardMarker {
  id: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  status: 'warn' | 'fail';
  note: string;
  item: string; // routing item key
  selected?: boolean;
}

/** A colour map over one copper layer (cell (c, r) centred on (x0 + c·res, y0 + r·res); NaN is clear). */
export interface BoardHeat {
  layer: string;
  x0: number;
  y0: number;
  res: number;
  nx: number;
  ny: number;
  values: Float32Array;
  max: number;
  min?: number; // bottom of the colour scale (0 when left out)
  /** A smooth field (temperature): drawn blended between cells and a little transparent over the copper. */
  smooth?: boolean;
}

export interface BoardViewApi {
  fit: () => void;
  zoomTo: (box: [number, number, number, number]) => void;
  image: () => HTMLCanvasElement | null;
}

interface Props {
  drawing: BoardDrawing;
  visible: Record<string, boolean>;
  highlight?: Set<string>;
  markers: BoardMarker[];
  onPick?: (p: { marker?: BoardMarker; net?: string }) => void;
  /** Height in px, or 'fill' to take the height of the container (full screen). */
  height?: number | 'fill';
  /** Area to show (board mm); when it changes the view zooms to it, after its own sizing. */
  focus?: [number, number, number, number] | null;
  /** Colour per track (index in drawing.tracks), drawn over the copper. */
  trackColors?: Map<number, string>;
  /** Colour per via (index in drawing.vias). */
  viaColors?: Map<number, string>;
  heat?: BoardHeat | null;
  /** Parts the view is about (heat sources, a DC source and its loads): always named, their bodies drawn brighter. */
  tagged?: string[];
}

type Camera = { x: number; y: number; scale: number }; // screen = (board − (x, y)) × scale

/** KiCad's default copper colours, inner layers cycling. */
export function layerColor(layer: string): string {
  if (layer === 'F.Cu') return '#c83434';
  if (layer === 'B.Cu') return '#4d7fc4';
  const inner = ['#7fc87f', '#ce7d2c', '#4fcbcb', '#db628b', '#c2c200', '#c261c2', '#6b8dd6', '#d6a76b'];
  const n = Number(/^In(\d+)\.Cu$/.exec(layer)?.[1] ?? 1);
  return inner[(n - 1) % inner.length];
}

const HEAT_STOPS: [number, number, number][] = [
  [44, 62, 145],
  [31, 161, 135],
  [166, 217, 106],
  [253, 174, 97],
  [215, 25, 28],
];
/** Colour of a value on a heat map, t from 0 (low) to 1 (high). */
export function heatRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  const u = x - i;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
}
export const heatColor = (t: number) => `rgb(${heatRgb(t).join(',')})`;
export const HEAT_GRADIENT = `linear-gradient(to right, ${HEAT_STOPS.map((c) => `rgb(${c.join(',')})`).join(', ')})`;

function heatImage(h: BoardHeat): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !h.nx || !h.ny) return null;
  const c = document.createElement('canvas');
  c.width = h.nx;
  c.height = h.ny;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(h.nx, h.ny);
  for (let i = 0; i < h.values.length; i++) {
    const v = h.values[i];
    if (!Number.isFinite(v)) continue;
    const lo = h.min ?? 0;
    const [r, g, b] = heatRgb(h.max > lo ? (v - lo) / (h.max - lo) : 0);
    img.data[4 * i] = r;
    img.data[4 * i + 1] = g;
    img.data[4 * i + 2] = b;
    img.data[4 * i + 3] = h.smooth ? 205 : 235;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}


interface LayerPaths {
  fills: Path2D;
  tracks: Map<number, Path2D>; // by width
  pads: Path2D;
}

function addTrack(path: Path2D, t: { x1: number; y1: number; x2: number; y2: number; mx?: number; my?: number }) {
  const a = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
  path.moveTo(t.x1, t.y1);
  if (a) path.arc(a.cx, a.cy, a.r, a.a0, a.a0 + a.da, a.da < 0);
  else path.lineTo(t.x2, t.y2);
}

function addPoly(path: Path2D, pts: ArrayLike<number> | [number, number][]) {
  if (Array.isArray(pts) && Array.isArray(pts[0])) {
    const p = pts as [number, number][];
    path.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]);
  } else {
    const p = pts as ArrayLike<number>;
    path.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
  }
  path.closePath();
}

/** Paths of the copper of a set of nets (all nets when `nets` is undefined), per layer, plus vias. */
function buildPaths(d: BoardDrawing, nets?: Set<string>) {
  const want = (n: string) => !nets || nets.has(n);
  const layers = new Map<string, LayerPaths>();
  const get = (l: string) => {
    let lp = layers.get(l);
    if (!lp) layers.set(l, (lp = { fills: new Path2D(), tracks: new Map(), pads: new Path2D() }));
    return lp;
  };
  for (const f of d.fills) if (want(f.net)) addPoly(get(f.layer).fills, f.xy);
  for (const t of d.tracks) {
    if (!want(t.net)) continue;
    const m = get(t.layer).tracks;
    const k = Math.round(t.w * 1e4) / 1e4;
    let p = m.get(k);
    if (!p) m.set(k, (p = new Path2D()));
    addTrack(p, t);
  }
  for (const p of d.pads) {
    if (!want(p.net)) continue;
    const o = padPolygon(p);
    for (const l of p.layers) addPoly(get(l).pads, o);
  }
  const vias = new Path2D();
  const holes = new Path2D();
  for (const v of d.vias) {
    if (!want(v.net)) continue;
    const r = (v.size ?? 0.6) / 2;
    vias.moveTo(v.x + r, v.y);
    vias.arc(v.x, v.y, r, 0, 2 * Math.PI);
    const h = (v.drill ?? 0.3) / 2;
    holes.moveTo(v.x + h, v.y);
    holes.arc(v.x, v.y, h, 0, 2 * Math.PI);
  }
  for (const p of d.pads) {
    if (!want(p.net) || !p.drill) continue;
    const h = p.drill / 2;
    holes.moveTo(p.x + h, p.y);
    holes.arc(p.x, p.y, h, 0, 2 * Math.PI);
  }
  return { layers, vias, holes };
}

function extent(d: BoardDrawing): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  // the outline and the copper together: a board whose only closed Edge.Cuts shape is a slot still fits whole
  for (const loop of d.outline) for (const [x, y] of loop) grow(x, y);
  for (const t of d.tracks) {
    grow(t.x1, t.y1);
    grow(t.x2, t.y2);
  }
  for (const p of d.pads) grow(p.x, p.y);
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 100, 100];
}

export const BoardView = forwardRef<BoardViewApi, Props>(function BoardView({ drawing, visible, highlight, markers, onPick, height = 560, focus, trackColors, viaColors, heat, tagged }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: height === 'fill' ? 560 : height });
  // a fixed height shrinks to the board's shape on a narrow screen, so a wide board does not sit in an empty box
  const aspect = useMemo(() => {
    const [x0, y0, x1, y1] = extent(drawing);
    return Math.max(y1 - y0, 1) / Math.max(x1 - x0, 1);
  }, [drawing]);
  const boxH = height === 'fill' ? 'fill' : Math.min(height, Math.max(240, Math.round(size.w * aspect + 24)));
  const cam = useRef<Camera>({ x: 0, y: 0, scale: 5 });
  const raf = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  // false until the view is zoomed, panned or sent to a selection: until then a resize refits the board
  const placed = useRef(false);

  const all = useMemo(() => buildPaths(drawing), [drawing]);
  const hl = useMemo(() => (highlight && highlight.size ? buildPaths(drawing, highlight) : null), [drawing, highlight]);
  const outline = useMemo(() => {
    const p = new Path2D();
    for (const loop of drawing.outline) addPoly(p, loop);
    return p;
  }, [drawing]);
  // bottom layer first, so the top layer is drawn last
  const order = useMemo(() => [...drawing.copper].reverse(), [drawing]);
  const heatCanvas = useMemo(() => (heat ? heatImage(heat) : null), [heat]);
  const estimated = useMemo(() => drawing.fills.some((f) => f.estimated), [drawing]);
  // part bodies (Fab outline, else courtyard) per side, and a label box per part: the body, else its pads
  const bodies = useMemo(() => {
    const top = new Path2D();
    const bottom = new Path2D();
    const padBox = new Map<string, [number, number, number, number]>();
    for (const p of drawing.pads) {
      const r = Math.max(p.w, p.h) / 2;
      const b = padBox.get(p.ref);
      if (!b) padBox.set(p.ref, [p.x - r, p.y - r, p.x + r, p.y + r]);
      else padBox.set(p.ref, [Math.min(b[0], p.x - r), Math.min(b[1], p.y - r), Math.max(b[2], p.x + r), Math.max(b[3], p.y + r)]);
    }
    const labels: { ref: string; back: boolean; x: number; y: number; w: number; h: number; top: number; box: [number, number, number, number]; body: boolean }[] = [];
    for (const part of drawing.parts) {
      const path = part.back ? bottom : top;
      let box: [number, number, number, number] | undefined;
      for (const g of part.body ?? []) {
        g.pts.forEach(([x, y], i) => {
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
          box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
        });
        if (g.closed) path.closePath();
      }
      const body = !!box;
      box ??= padBox.get(part.ref);
      if (box) labels.push({ ref: part.ref, back: part.back, x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, w: box[2] - box[0], h: box[3] - box[1], top: box[1], box, body });
    }
    labels.sort((a, b) => b.w * b.h - a.w * a.h);
    return { top, bottom, labels };
  }, [drawing]);
  // the tagged parts: their bodies again (or the box of their pads), drawn brighter
  const taggedKey = tagged?.join('\n') ?? '';
  const tags = useMemo(() => {
    const refs = new Set(taggedKey ? taggedKey.split('\n') : []);
    const path = new Path2D();
    for (const part of drawing.parts) {
      if (!refs.has(part.ref)) continue;
      for (const g of part.body ?? []) {
        g.pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
        if (g.closed) path.closePath();
      }
    }
    for (const l of bodies.labels) if (refs.has(l.ref) && !l.body) path.rect(l.box[0], l.box[1], l.w, l.h);
    return { refs, path };
  }, [taggedKey, drawing, bodies]);
  // coloured tracks grouped by layer, colour and width
  const colored = useMemo(() => {
    const m = new Map<string, { layer: string; color: string; w: number; path: Path2D }>();
    for (const [i, color] of trackColors ?? []) {
      const t = drawing.tracks[i];
      if (!t) continue;
      const k = `${t.layer}|${color}|${t.w}`;
      let g = m.get(k);
      if (!g) m.set(k, (g = { layer: t.layer, color, w: t.w, path: new Path2D() }));
      addTrack(g.path, t);
    }
    return [...m.values()];
  }, [trackColors, drawing]);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = el.getContext('2d')!;
    const { x, y, scale } = cam.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -x * scale * dpr, -y * scale * dpr);
    ctx.fillStyle = '#16231c';
    ctx.fill(outline, 'evenodd');
    const paint = (set: ReturnType<typeof buildPaths>, alpha: number) => {
      for (const l of order) {
        if (!visible[l]) continue;
        const lp = set.layers.get(l);
        if (!lp) continue;
        const c = layerColor(l);
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = c;
        ctx.fill(lp.fills);
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = c;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [w, p] of lp.tracks) {
          ctx.lineWidth = Math.max(w, 0.5 / scale);
          ctx.stroke(p);
        }
        ctx.fill(lp.pads);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#c7b04f';
      ctx.fill(set.vias);
      ctx.fillStyle = '#101418';
      ctx.fill(set.holes);
    };
    paint(all, hl || heatCanvas ? 0.28 : 1);
    if (hl) {
      paint(hl, 1);
      // outline the highlighted copper so it stands out on any layer colour
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / scale;
      for (const l of order) {
        if (!visible[l]) continue;
        const lp = hl.layers.get(l);
        if (!lp) continue;
        ctx.stroke(lp.pads);
      }
    }
    // the heat map over the copper, then the coloured tracks and vias over it
    if (heat && heatCanvas && visible[heat.layer]) {
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = !!heat.smooth;
      ctx.drawImage(heatCanvas, heat.x0 - heat.res / 2, heat.y0 - heat.res / 2, heat.nx * heat.res, heat.ny * heat.res);
    }
    if (colored.length) {
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const l of order) {
        if (!visible[l]) continue;
        for (const g of colored) {
          if (g.layer !== l) continue;
          ctx.strokeStyle = g.color;
          ctx.lineWidth = Math.max(g.w, 2 / scale);
          ctx.stroke(g.path);
        }
      }
    }
    if (viaColors?.size) {
      ctx.globalAlpha = 1;
      for (const [i, col] of viaColors) {
        const v = drawing.vias[i];
        if (!v) continue;
        ctx.beginPath();
        ctx.arc(v.x, v.y, Math.max((v.size ?? 0.6) / 2, 3 / scale), 0, 2 * Math.PI);
        ctx.fillStyle = col;
        ctx.fill();
      }
    }
    // part bodies over the copper and the heat map, each with its side's copper
    const sideOn = (back: boolean) => !!visible[back ? (drawing.copper[drawing.copper.length - 1] ?? 'B.Cu') : (drawing.copper[0] ?? 'F.Cu')];
    ctx.lineWidth = 1 / scale;
    ctx.globalAlpha = 0.75;
    if (sideOn(true)) {
      ctx.strokeStyle = '#8aa4c8';
      ctx.stroke(bodies.bottom);
    }
    if (sideOn(false)) {
      ctx.strokeStyle = '#d0d7de';
      ctx.stroke(bodies.top);
    }
    if (tags.refs.size) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.8 / scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke(tags.path);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#d6d36a';
    ctx.lineWidth = 1.2 / scale;
    ctx.stroke(outline);
    // markers in screen pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (bx: number) => (bx - x) * scale;
    const sy = (by: number) => (by - y) * scale;
    // references, sized to fit the part (a character is about 0.6 of the font size wide), once they are readable
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Board annotations use their physical text size; hide text that is too small to read.
    for (const label of drawing.labels ?? []) {
      if (!sideOn(label.back) || label.size * scale < 5.5) continue;
      ctx.save(); ctx.translate(sx(label.x), sy(label.y)); ctx.rotate(-label.angle * Math.PI / 180);
      ctx.font = `500 ${Math.max(9, Math.min(28, label.size * scale)).toFixed(1)}px system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,20,24,0.9)'; ctx.fillStyle = label.back ? '#b4c6e0' : '#f0f3f6';
      for (const [i, line] of label.text.split('\n').entries()) { ctx.strokeText(line, 0, i * label.size * scale * 1.4); ctx.fillText(line, 0, i * label.size * scale * 1.4); }
      ctx.restore();
    }
    // the tagged parts first and always (when there are a few; many still give way to each other), a part too
    // small for its name inside named above it; then the larger parts first, a label overlapping one drawn left out
    const drawn: [number, number, number, number][] = [];
    const ordered = tags.refs.size ? [...bodies.labels.filter((l) => tags.refs.has(l.ref)), ...bodies.labels.filter((l) => !tags.refs.has(l.ref))] : bodies.labels;
    for (const l of ordered) {
      const tag = tags.refs.has(l.ref);
      if (!tag && !sideOn(l.back)) continue;
      const fit = Math.min(14, (l.h * scale) / 2, (l.w * scale * 0.9) / (0.6 * l.ref.length));
      const fsz = tag ? Math.max(11, fit) : fit;
      if (fsz < 8) continue;
      const lx = sx(l.x);
      const ly = tag && fit < 11 ? sy(l.top) - fsz / 2 - 3 : sy(l.y);
      if (lx < -50 || ly < -20 || lx > size.w + 50 || ly > size.h + 20) continue;
      const hw = (0.6 * fsz * l.ref.length) / 2 + 2;
      const hh = fsz / 2 + 1;
      if ((!tag || tags.refs.size > 12) && drawn.some((r) => lx - hw < r[2] && lx + hw > r[0] && ly - hh < r[3] && ly + hh > r[1])) continue;
      drawn.push([lx - hw, ly - hh, lx + hw, ly + hh]);
      ctx.font = `600 ${fsz.toFixed(1)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(16, 20, 24, 0.85)';
      ctx.strokeText(l.ref, lx, ly);
      ctx.fillStyle = l.back ? '#b4c6e0' : '#f0f3f6';
      ctx.fillText(l.ref, lx, ly);
    }
    const anySelected = markers.some((m) => m.selected);
    for (const m of [...markers].sort((a, b) => Number(!!a.selected) - Number(!!b.selected))) {
      const col = m.status === 'fail' ? '#ff4d4f' : '#f5a623';
      // with a finding selected, the others step back
      const faded = anySelected && !m.selected;
      if (m.x2 !== undefined && m.y2 !== undefined && m.selected) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx(m.x), sy(m.y));
        ctx.lineTo(sx(m.x2), sy(m.y2));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sx(m.x2), sy(m.y2), 5, 0, 2 * Math.PI);
        ctx.strokeStyle = '#7ee787';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const r = m.selected ? 11 : faded ? 5 : 7;
      ctx.beginPath();
      ctx.arc(sx(m.x), sy(m.y), r, 0, 2 * Math.PI);
      ctx.lineWidth = m.selected ? 3 : faded ? 1.5 : 2;
      ctx.strokeStyle = col;
      ctx.globalAlpha = faded ? 0.45 : 1;
      ctx.stroke();
      ctx.globalAlpha = m.selected ? 0.35 : faded ? 0.08 : 0.2;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // zone copper estimated here, not read from the file: said on the view itself
    if (estimated) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const t = 'Zone fill: estimate';
      const w = ctx.measureText(t).width;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#101418';
      ctx.fillRect(6, 6, w + 12, 18);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = 1;
      ctx.strokeRect(6.5, 6.5, w + 11, 17);
      ctx.fillStyle = '#f5a623';
      ctx.fillText(t, 12, 10);
    }
  }, [all, hl, outline, order, visible, markers, size, colored, viaColors, heat, heatCanvas, drawing, bodies, tags, estimated]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const zoomTo = useCallback(
    (box: [number, number, number, number]) => {
      const pad = 0.08;
      const w = Math.max(box[2] - box[0], 1);
      const h = Math.max(box[3] - box[1], 1);
      const scale = Math.min(size.w / (w * (1 + 2 * pad)), size.h / (h * (1 + 2 * pad)));
      cam.current = { scale, x: (box[0] + box[2]) / 2 - size.w / 2 / scale, y: (box[1] + box[3]) / 2 - size.h / 2 / scale };
      placed.current = true;
      schedule();
    },
    [size, schedule],
  );
  const fit = useCallback(() => {
    zoomTo(extent(drawing));
    placed.current = false;
  }, [zoomTo, drawing]);

  useImperativeHandle(ref, () => ({ fit, zoomTo, image: () => canvas.current }), [fit, zoomTo]);

  // size: follow the container width (and its height in 'fill' mode)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxH]);
  // a resize keeps the centre of a view the user has moved where it was
  const lastSize = useRef(size);
  useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = size;
    if (!placed.current || (prev.w === size.w && prev.h === size.h)) return;
    const c = cam.current;
    cam.current = { ...c, x: c.x + (prev.w - size.w) / 2 / c.scale, y: c.y + (prev.h - size.h) / 2 / c.scale };
    schedule();
  }, [size, schedule]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    schedule();
  }, [size, schedule]);
  // fit a new board, and refit on a resize until the view has been moved
  useEffect(() => {
    placed.current = false;
  }, [drawing]);
  useEffect(() => {
    if (!placed.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, size.w, size.h]);
  // a focus area wins over the fit; it is applied again when the size settles
  const focusKey = focus ? focus.map((v) => v.toFixed(3)).join(',') : '';
  useEffect(() => {
    if (focus) zoomTo(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, drawing, size.w, size.h]);
  useEffect(() => schedule(), [schedule]);

  const zoomAt = (factor: number, px: number, py: number) => {
    const c = cam.current;
    const bx = c.x + px / c.scale;
    const by = c.y + py / c.scale;
    const scale = Math.min(Math.max(c.scale * factor, 0.2), 2000);
    cam.current = { scale, x: bx - px / scale, y: by - py / scale };
    placed.current = true;
    schedule();
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  /** What is under a screen point: a marker within 10 px, else the net of the copper there. */
  const pick = (px: number, py: number) => {
    const c = cam.current;
    for (const m of [...markers].reverse()) if (Math.hypot((m.x - c.x) * c.scale - px, (m.y - c.y) * c.scale - py) <= 10) return { marker: m };
    const bx = c.x + px / c.scale;
    const by = c.y + py / c.scale;
    const slack = 3 / c.scale;
    for (const l of drawing.copper) {
      if (!visible[l]) continue;
      for (const t of drawing.tracks) {
        if (t.layer !== l || !t.net) continue;
        const dx = t.x2 - t.x1;
        const dy = t.y2 - t.y1;
        const l2 = dx * dx + dy * dy;
        const u = l2 > 0 ? Math.max(0, Math.min(1, ((bx - t.x1) * dx + (by - t.y1) * dy) / l2)) : 0;
        if (Math.hypot(t.x1 + u * dx - bx, t.y1 + u * dy - by) <= t.w / 2 + slack) return { net: t.net };
      }
    }
    for (const p of drawing.pads) if (p.net && p.layers.some((l) => visible[l]) && Math.hypot(p.x - bx, p.y - by) <= Math.max(p.w, p.h) / 2) return { net: p.net };
    for (const v of drawing.vias) if (v.net && Math.hypot(v.x - bx, v.y - by) <= (v.size ?? 0.6) / 2 + slack) return { net: v.net };
    return {};
  };

  return (
    <div ref={wrap} className="board-canvas relative w-full select-none" data-fill={boxH === 'fill' || undefined} style={{ height: boxH === 'fill' ? '100%' : boxH }}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h, touchAction: 'none', cursor: 'grab' }}
        tabIndex={0}
        role="img"
        aria-label="Board view. Drag to pan, use the mouse wheel or plus and minus to zoom, arrow keys pan, F fits the board. Click a marker or a track to select it."
        onKeyDown={(e) => {
          const c = cam.current;
          if (e.key === 'f' || e.key === 'F') fit();
          else if (e.key === '+' || e.key === '=') zoomAt(1.25, size.w / 2, size.h / 2);
          else if (e.key === '-') zoomAt(0.8, size.w / 2, size.h / 2);
          else if (e.key.startsWith('Arrow')) {
            const d = 40 / c.scale;
            cam.current = { ...c, x: c.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0), y: c.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0) };
            schedule();
          } else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved.current = 0;
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const next = { x: e.clientX, y: e.clientY };
          const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
          const c = cam.current;
          if (others.length === 1) {
            const o = others[0][1];
            const before = Math.hypot(prev.x - o.x, prev.y - o.y);
            const after = Math.hypot(next.x - o.x, next.y - o.y);
            const r = canvas.current!.getBoundingClientRect();
            if (before > 0) zoomAt(after / before, (next.x + o.x) / 2 - r.left, (next.y + o.y) / 2 - r.top);
          } else {
            cam.current = { ...c, x: c.x - (next.x - prev.x) / c.scale, y: c.y - (next.y - prev.y) / c.scale };
            placed.current = true;
            schedule();
          }
          moved.current += Math.hypot(next.x - prev.x, next.y - prev.y);
          pointers.current.set(e.pointerId, next);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (moved.current < 4 && onPick) {
            const r = canvas.current!.getBoundingClientRect();
            onPick(pick(e.clientX - r.left, e.clientY - r.top));
          }
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      />
    </div>
  );
});
