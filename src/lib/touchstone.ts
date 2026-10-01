/** The subset of Touchstone needed to inspect conventional two-port S-parameters. */
export interface S2pPoint {
  fHz: number;
  s11Db: number;
  s21Db: number;
  s12Db: number;
  s22Db: number;
}

export interface S2pData {
  points: S2pPoint[];
  referenceOhms: [number, number];
  format: 'RI' | 'MA' | 'DB';
  version: string;
}

const UNIT_HZ: Record<string, number> = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };

function magnitudeDb(a: number, b: number, format: S2pData['format']): number {
  if (format === 'DB') return a;
  if (format === 'MA' && a < 0) throw new Error('Magnitude-angle data cannot have a negative magnitude.');
  const magnitude = format === 'MA' ? a : Math.hypot(a, b);
  if (!Number.isFinite(magnitude)) throw new Error('An S-parameter magnitude is outside the supported range.');
  return magnitude === 0 ? -Infinity : 20 * Math.log10(magnitude);
}

/** Reads Touchstone v1/v1.1 and the conventional, full or symmetric two-port v2/v2.1 network section. */
export function parseS2p(input: string): S2pData {
  if (input.length > 5_000_000) throw new Error('The file is larger than the 5 MB viewer limit.');
  let version = '1.0';
  let scale = 1e9;
  let format: S2pData['format'] = 'MA';
  let referenceOhms: [number, number] = [50, 50];
  let portCount: number | undefined;
  let declaredCount: number | undefined;
  let order: '21_12' | '12_21' | undefined;
  let matrix: 'FULL' | 'LOWER' | 'UPPER' = 'FULL';
  let optionSeen = false;
  let networkSeen = false;
  let ended = false;
  let inData = false;
  let hasMixedMode = false;
  const data: string[] = [];

  for (const raw of input.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const line = raw.split('!')[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const match = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
      if (!match) throw new Error(`Invalid Touchstone keyword: ${line.slice(0, 50)}`);
      const keyword = match[1].trim().toLowerCase();
      const arg = match[2].trim();
      inData = false;
      if (keyword === 'version') {
        if (!['1.0', '1.1', '2.0', '2.1'].includes(arg)) throw new Error(`Unsupported Touchstone version: ${arg}`);
        version = arg;
      } else if (keyword === 'number of ports') {
        portCount = Number(arg);
      } else if (keyword === 'number of frequencies') {
        declaredCount = Number(arg);
        if (!Number.isSafeInteger(declaredCount) || declaredCount < 1) throw new Error('Invalid [Number of Frequencies].');
      } else if (keyword === 'two-port data order') {
        if (arg !== '21_12' && arg !== '12_21') throw new Error('Unsupported [Two-Port Data Order].');
        order = arg;
      } else if (keyword === 'matrix format') {
        const value = arg.toUpperCase();
        if (value !== 'FULL' && value !== 'LOWER' && value !== 'UPPER') throw new Error('Unsupported [Matrix Format].');
        matrix = value;
      } else if (keyword === 'reference') {
        const values = arg.split(/\s+/).map(Number);
        if (values.length !== 2 || values.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error('[Reference] needs two positive port impedances.');
        referenceOhms = [values[0], values[1]];
      } else if (keyword === 'network data') {
        networkSeen = true;
        inData = true;
      } else if (keyword === 'mixed-mode order') {
        hasMixedMode = true;
      } else if (keyword === 'end') {
        ended = true;
      }
      continue;
    }
    if (line.startsWith('#')) {
      if (optionSeen) throw new Error('The file contains more than one option line.');
      optionSeen = true;
      const tokens = line.slice(1).trim().toUpperCase().split(/\s+/).filter(Boolean);
      let parameter = 'S';
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token in UNIT_HZ) scale = UNIT_HZ[token];
        else if (['S', 'Y', 'Z', 'H', 'G'].includes(token)) parameter = token;
        else if (token === 'RI' || token === 'MA' || token === 'DB') format = token;
        else if (token === 'R') {
          const value = Number(tokens[++i]);
          if (!Number.isFinite(value) || value <= 0) throw new Error('The option line needs a positive reference impedance after R.');
          referenceOhms = [value, value];
        } else throw new Error(`Unsupported option-line token: ${token}`);
      }
      if (parameter !== 'S') throw new Error('This viewer accepts S-parameters only.');
      continue;
    }
    if (ended) throw new Error('Unexpected content after [End].');
    if (version.startsWith('1.') || inData) data.push(...line.split(/\s+/));
  }

  if (portCount !== undefined && portCount !== 2) throw new Error('This viewer accepts two-port files only.');
  if (hasMixedMode) throw new Error('Mixed-mode files are not supported; export conventional two-port S-parameters.');
  if (version.startsWith('1.') && (order || matrix !== 'FULL')) throw new Error('Touchstone 1.x two-port data must use the full S11, S21, S12, S22 order.');
  if (version.startsWith('2.') && (!networkSeen || !ended || portCount !== 2 || !order)) throw new Error('The Touchstone 2.x file is missing its port count, data order, network data or [End] keyword.');
  if (!data.length) throw new Error('No two-port network data found.');
  const stride = matrix === 'FULL' ? 9 : 7;
  if (data.length % stride) throw new Error(`Incomplete two-port data: expected ${stride} values per frequency point.`);
  if (data.length / stride > 100_000) throw new Error('The file has more than 100,000 frequency points.');
  const points: S2pPoint[] = [];
  for (let i = 0; i < data.length; i += stride) {
    const row = data.slice(i, i + stride).map(Number);
    if (row.some((n) => !Number.isFinite(n))) throw new Error(`Invalid number at frequency point ${points.length + 1}.`);
    const fHz = row[0] * scale;
    if (!Number.isFinite(fHz) || fHz < 0 || (points.length && fHz <= points[points.length - 1].fHz)) throw new Error('Frequencies must be finite, non-negative and strictly increasing.');
    const db = (offset: number) => magnitudeDb(row[offset], row[offset + 1], format);
    const s11Db = db(1);
    const s22Db = db(matrix === 'FULL' ? 7 : 5);
    const s21Db = db(3);
    const s12Db = matrix === 'FULL' ? db(5) : s21Db;
    points.push({ fHz, s11Db, s21Db: order === '12_21' ? s12Db : s21Db, s12Db: order === '12_21' ? s21Db : s12Db, s22Db });
  }
  if (declaredCount !== undefined && declaredCount !== points.length) throw new Error(`[Number of Frequencies] says ${declaredCount}, but the file contains ${points.length}.`);
  return { points, referenceOhms, format, version };
}

/** Interpolates displayed dB values on a linear frequency axis; no extrapolation. */
export function sampleS2p(points: S2pPoint[], fHz: number): S2pPoint | null {
  if (!points.length || !Number.isFinite(fHz) || fHz < points[0].fHz || fHz > points[points.length - 1].fHz) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].fHz < fHz) lo = mid + 1;
    else hi = mid;
  }
  if (points[lo].fHz === fHz || lo === 0) return points[lo];
  const a = points[lo - 1];
  const b = points[lo];
  const t = (fHz - a.fHz) / (b.fHz - a.fHz);
  const interp = (x: number, y: number) => !Number.isFinite(x) || !Number.isFinite(y) ? (t < 0.5 ? x : y) : x + (y - x) * t;
  return { fHz, s11Db: interp(a.s11Db, b.s11Db), s21Db: interp(a.s21Db, b.s21Db), s12Db: interp(a.s12Db, b.s12Db), s22Db: interp(a.s22Db, b.s22Db) };
}
