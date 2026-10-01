// Touchstone reader: versions 1.0, 1.1, 2.0 and 2.1 of the IBIS Open Forum
// "Touchstone File Format Specification" (2.1, ratified 26 January 2024).
//
// Network data is stored as S-parameters in typed arrays. Y- and Z-parameter
// files are converted to S with the power-wave definitions of the specification;
// H- and G-parameter files and mixed-mode ([Mixed-Mode Order]) files are rejected.

export type TsFormat = 'RI' | 'MA' | 'DB';
export type TsParameter = 'S' | 'Y' | 'Z' | 'H' | 'G';
export type TsVersion = '1.0' | '1.1' | '2.0' | '2.1';
export type MatrixFormat = 'Full' | 'Lower' | 'Upper';

/** Square complex matrices at a list of frequencies. Element (i, j) at point k is at k·n² + i·n + j (i = response port, j = stimulus port, 0-based). */
export interface Matrices {
  ports: number;
  /** Frequencies in Hz, strictly increasing. */
  freq: Float64Array;
  re: Float64Array;
  im: Float64Array;
}

export interface Network extends Matrices {
  /** Real reference resistance of every port, Ω. */
  referenceOhms: number[];
  version: TsVersion;
  format: TsFormat;
  /** Parameter type stored in the file; the data in `re`/`im` is always S. */
  parameter: TsParameter;
  matrix: MatrixFormat;
  twoPortOrder: '21_12' | '12_21' | null;
  /** Noise-parameter lines found and skipped. */
  noiseLines: number;
  /** Remarks about the file that do not stop it from being read. */
  notes: string[];
}

export class TouchstoneError extends Error {
  line: number | null;
  constructor(message: string, line: number | null = null) {
    super(line === null ? message : `Line ${line}: ${message}`);
    this.name = 'TouchstoneError';
    this.line = line;
  }
}

export const MAX_PORTS = 16;
/** Largest number of complex matrix entries (frequency points × ports²) held in memory. */
export const MAX_ENTRIES = 4_000_000;
export const MAX_FILE_CHARS = 40_000_000;

const UNIT_HZ: Record<string, number> = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };
const DEG = Math.PI / 180;

/** Port count from a ".sNp" file name, or null. */
export function portsFromFileName(name: string): number | null {
  const m = /\.s(\d{1,3})p$/i.exec(name.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

const isSpace = (c: number) => c === 32 || c === 9 || c === 13 || c === 11 || c === 12;

/** Whitespace-separated tokens of text[a, b). */
function tokens(text: string, a: number, b: number): string[] {
  const out: string[] = [];
  let i = a;
  while (i < b) {
    while (i < b && isSpace(text.charCodeAt(i))) i++;
    if (i >= b) break;
    const s = i;
    while (i < b && !isSpace(text.charCodeAt(i))) i++;
    out.push(text.slice(s, i));
  }
  return out;
}

const describeValue = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(8))));

/**
 * Pair order of one frequency point: the matrix element each data pair belongs to and,
 * for Lower and Upper matrices, the mirrored element that receives the same value.
 */
function pairLayout(n: number, matrix: MatrixFormat, order: '21_12' | '12_21'): { target: Int32Array; mirror: Int32Array } {
  const t: number[] = [];
  const m: number[] = [];
  if (n === 2 && matrix === 'Full') {
    // 2-port exception: N11 N21 N12 N22 (Touchstone 1.x and [Two-Port Data Order] 21_12), or N11 N12 N21 N22 (12_21)
    const order2 = order === '21_12' ? [0, 2, 1, 3] : [0, 1, 2, 3];
    return { target: Int32Array.from(order2), mirror: Int32Array.from([-1, -1, -1, -1]) };
  }
  for (let i = 0; i < n; i++) {
    const from = matrix === 'Upper' ? i : 0;
    const to = matrix === 'Lower' ? i : n - 1;
    for (let j = from; j <= to; j++) {
      t.push(i * n + j);
      m.push(matrix === 'Full' || i === j ? -1 : j * n + i);
    }
  }
  return { target: Int32Array.from(t), mirror: Int32Array.from(m) };
}

interface Header {
  version: TsVersion | null;
  scale: number;
  parameter: TsParameter;
  format: TsFormat;
  optionR: number[] | null;
  optionSeen: boolean;
}

/** Reads the option line "# <unit> <parameter> <format> R <n>" (first one only). */
function readOptionLine(h: Header, list: string[], ports: number | null, line: number) {
  for (let i = 0; i < list.length; i++) {
    const tok = list[i].toUpperCase();
    if (tok in UNIT_HZ) h.scale = UNIT_HZ[tok];
    else if (tok === 'S' || tok === 'Y' || tok === 'Z' || tok === 'H' || tok === 'G') h.parameter = tok;
    else if (tok === 'RI' || tok === 'MA' || tok === 'DB') h.format = tok;
    else if (tok === 'R') {
      const values: number[] = [];
      while (i + 1 < list.length && Number.isFinite(Number(list[i + 1])) && list[i + 1] !== '') values.push(Number(list[++i]));
      if (!values.length) throw new TouchstoneError('the option line needs a reference resistance after R.', line);
      if (values.some((v) => !(v > 0))) throw new TouchstoneError('reference resistances must be positive.', line);
      if (values.length > 1) {
        if (h.version === '2.0' || h.version === '2.1') throw new TouchstoneError('Touchstone 2.x allows one R value on the option line; per-port references go under [Reference].', line);
        if (ports !== null && values.length !== ports) throw new TouchstoneError(`R lists ${values.length} reference resistances, but the file has ${ports} ports.`, line);
      }
      h.optionR = values;
    } else throw new TouchstoneError(`unknown option-line entry "${list[i]}". Expected Hz/kHz/MHz/GHz, S/Y/Z/H/G, DB/MA/RI and R <ohms>.`, line);
  }
  if (h.parameter === 'H' || h.parameter === 'G') throw new TouchstoneError(`${h.parameter}-parameter (hybrid) files are not converted by this viewer. Export S-, Y- or Z-parameters.`, line);
}

/**
 * Parses a Touchstone file. `ports` comes from the ".sNp" extension and is required for
 * version 1.x files, which do not state their port count; version 2.x files use [Number of Ports].
 */
export function parseTouchstone(input: string, options: { ports?: number | null } = {}): Network {
  if (input.length > MAX_FILE_CHARS) throw new TouchstoneError(`The file is larger than the ${MAX_FILE_CHARS / 1e6} MB limit of this viewer.`);
  let text = input;
  if (text.indexOf('\n') < 0 && text.indexOf('\r') >= 0) text = text.replace(/\r/g, '\n'); // CR-only line ends
  const len = text.length;
  const extPorts = options.ports ?? null;

  const h: Header = { version: null, scale: 1e9, parameter: 'S', format: 'MA', optionR: null, optionSeen: false };
  let ports: number | null = null;
  let declaredFreqs: number | null = null;
  let declaredNoise: number | null = null;
  let order: '21_12' | '12_21' | null = null;
  let matrix: MatrixFormat = 'Full';
  let reference = null as number[] | null;
  let referenceLine = 0;
  const seen = new Set<string>();
  // phase of the reader
  let phase = 'start' as 'start' | 'header' | 'reference' | 'info' | 'network' | 'noise' | 'end';
  let networkSeen = false;
  let noiseSeen = false;
  let noiseLines = 0;
  let firstKeywordAfterOption = true;
  const notes: string[] = [];

  // network data storage
  let n = 0;
  let recLen = 0;
  let pairs = 0;
  let target: Int32Array = new Int32Array(0);
  let mirror: Int32Array = new Int32Array(0);
  let rec = new Float64Array(0);
  let ri = 0;
  let recLine = 0;
  let count = 0;
  let cap = 0;
  let freq = new Float64Array(0);
  let re = new Float64Array(0);
  let im = new Float64Array(0);
  let lastF = -Infinity;

  const v2 = () => h.version === '2.0' || h.version === '2.1';

  const startNetwork = (line: number) => {
    if (ports === null) throw new TouchstoneError('the port count is unknown.', line);
    n = ports;
    pairs = matrix === 'Full' ? n * n : (n * (n + 1)) / 2;
    recLen = 1 + 2 * pairs;
    ({ target, mirror } = pairLayout(n, matrix, order ?? '21_12'));
    rec = new Float64Array(recLen);
    cap = declaredFreqs !== null ? Math.max(1, Math.min(declaredFreqs, Math.floor(MAX_ENTRIES / (n * n)))) : 1024;
    freq = new Float64Array(cap);
    re = new Float64Array(cap * n * n);
    im = new Float64Array(cap * n * n);
    phase = 'network';
  };

  const grow = () => {
    const next = cap * 2;
    const f2 = new Float64Array(next);
    f2.set(freq);
    const r2 = new Float64Array(next * n * n);
    r2.set(re);
    const i2 = new Float64Array(next * n * n);
    i2.set(im);
    freq = f2;
    re = r2;
    im = i2;
    cap = next;
  };

  const commit = () => {
    if ((count + 1) * n * n > MAX_ENTRIES) throw new TouchstoneError(`The file holds more than ${MAX_ENTRIES.toLocaleString('en-US')} matrix entries (frequency points × ports²), the limit of this viewer.`, recLine);
    if (count === cap) grow();
    freq[count] = rec[0];
    const base = count * n * n;
    const fmt = h.format;
    for (let p = 0; p < pairs; p++) {
      const a = rec[1 + 2 * p];
      const b = rec[2 + 2 * p];
      let x: number, y: number;
      if (fmt === 'RI') {
        x = a;
        y = b;
      } else {
        if (fmt === 'MA' && a < 0) throw new TouchstoneError(`a magnitude cannot be negative (${describeValue(a)}).`, recLine);
        const mag = fmt === 'MA' ? a : Math.pow(10, a / 20);
        x = mag * Math.cos(b * DEG);
        y = mag * Math.sin(b * DEG);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TouchstoneError(`the value ${describeValue(a)} ${fmt} is out of range.`, recLine);
      }
      re[base + target[p]] = x;
      im[base + target[p]] = y;
      const mi = mirror[p];
      if (mi >= 0) {
        re[base + mi] = x;
        im[base + mi] = y;
      }
    }
    count++;
  };

  /** Network data value; `first` is true for the first value on a line. */
  const feed = (v: number, first: boolean, line: number) => {
    if (ri === 0) {
      if (!first) throw new TouchstoneError(`a frequency point must start on a new line, but this value falls mid-line. The data does not fit ${n}-port ${matrix.toLowerCase()}-matrix records of ${recLen} values (frequency + ${recLen - 1}).`, line);
      const f = v * h.scale;
      if (f < 0) throw new TouchstoneError(`the frequency ${describeValue(v)} is negative.`, line);
      if (count > 0 && f <= lastF) {
        if (!v2() && n === 2) {
          phase = 'noise'; // Touchstone 1.x: noise data starts where the frequency stops increasing
          return false;
        }
        throw new TouchstoneError(`the frequency ${describeValue(v)} is not above the previous one; frequency points must increase. Check the port count (${n}) and the data layout.`, line);
      }
      if (declaredFreqs !== null && count >= declaredFreqs) throw new TouchstoneError(`more frequency points than [Number of Frequencies] ${declaredFreqs}.`, line);
      lastF = f;
      recLine = line;
      rec[0] = f;
    } else rec[ri] = v;
    ri++;
    if (ri === recLen) {
      commit();
      ri = 0;
    }
    return true;
  };

  const needPorts = (line: number) => {
    if (ports === null) throw new TouchstoneError('[Number of Ports] must come before this keyword.', line);
    return ports;
  };

  const keyword = (name: string, args: string[], line: number) => {
    const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (phase === 'info') {
      if (key === 'end information') phase = 'header';
      return;
    }
    if (phase === 'end') throw new TouchstoneError('content after [End].', line);
    if (key === 'version') {
      if (phase !== 'start' || seen.has(key)) throw new TouchstoneError('[Version] must be the first line of the file (comments aside).', line);
      const value = args[0] ?? '';
      if (value === '1.0' || value === '1.1') {
        // not defined by the specification, but written by some exporters: read the rest as a version 1 file
        if (args.length > 1) throw new TouchstoneError('[Version] takes one argument.', line);
        seen.add(key);
        notes.push(`The file declares [Version] ${value}, which the specification does not define; it was read as a version 1 file.`);
        return;
      }
      if (value !== '2.0' && value !== '2.1') throw new TouchstoneError(`unsupported [Version] "${value}". Touchstone 2.x files state 2.0 or 2.1; version 1.x files have no [Version] line.`, line);
      if (args.length > 1) throw new TouchstoneError('[Version] takes one argument.', line);
      h.version = value;
      phase = 'header';
      seen.add(key);
      return;
    }
    if (h.version === null || h.version === '1.0' || h.version === '1.1') throw new TouchstoneError(`[${name}] is a Touchstone 2.x keyword, but the file does not start with [Version] 2.0 or 2.1.`, line);
    if (phase === 'reference') throw new TouchstoneError(`[Reference] lists ${reference?.length ?? 0} of ${ports} port reference resistances before [${name}].`, referenceLine);
    if (!h.optionSeen && key !== 'end') throw new TouchstoneError('the option line (#) must follow [Version] and come before the other keywords.', line);
    if (seen.has(key) && key !== 'end') throw new TouchstoneError(`[${name}] appears more than once.`, line);
    if (firstKeywordAfterOption && key !== 'number of ports') throw new TouchstoneError(`[Number of Ports] must be the first keyword after the option line, found [${name}].`, line);
    firstKeywordAfterOption = false;
    seen.add(key);
    const single = () => {
      if (args.length !== 1) throw new TouchstoneError(`[${name}] takes one argument.`, line);
      return args[0];
    };
    const positiveInt = () => {
      const v = Number(single());
      if (!Number.isSafeInteger(v) || v < 1) throw new TouchstoneError(`[${name}] needs a positive integer.`, line);
      return v;
    };
    const beforeData = () => {
      if (phase !== 'header') throw new TouchstoneError(`[${name}] must come before [Network Data].`, line);
    };
    switch (key) {
      case 'number of ports': {
        const v = positiveInt();
        if (v > MAX_PORTS) throw new TouchstoneError(`${v} ports; this viewer reads up to ${MAX_PORTS}.`, line);
        ports = v;
        if (h.optionR && h.optionR.length > 1) throw new TouchstoneError('Touchstone 2.x allows one R value on the option line; per-port references go under [Reference].', line);
        return;
      }
      case 'two-port data order': {
        beforeData();
        if (needPorts(line) !== 2) throw new TouchstoneError('[Two-Port Data Order] is only allowed when [Number of Ports] is 2.', line);
        const v = single();
        if (v !== '21_12' && v !== '12_21') throw new TouchstoneError(`[Two-Port Data Order] must be 21_12 or 12_21, not "${v}".`, line);
        order = v;
        return;
      }
      case 'number of frequencies':
        beforeData();
        needPorts(line);
        declaredFreqs = positiveInt();
        return;
      case 'number of noise frequencies':
        beforeData();
        needPorts(line);
        declaredNoise = positiveInt();
        return;
      case 'reference': {
        beforeData();
        const np = needPorts(line);
        reference = [];
        referenceLine = line;
        for (const a of args) addReference(a, line);
        if (reference.length < np) phase = 'reference';
        return;
      }
      case 'matrix format': {
        beforeData();
        needPorts(line);
        const v = single().toLowerCase();
        if (v !== 'full' && v !== 'lower' && v !== 'upper') throw new TouchstoneError(`[Matrix Format] must be Full, Lower or Upper, not "${args[0]}".`, line);
        matrix = v === 'full' ? 'Full' : v === 'lower' ? 'Lower' : 'Upper';
        return;
      }
      case 'mixed-mode order':
        throw new TouchstoneError('mixed-mode network data ([Mixed-Mode Order]) is not read by this viewer. Export single-ended S-parameters; the viewer converts a 4-port to mixed mode itself.', line);
      case 'begin information':
        beforeData();
        needPorts(line);
        phase = 'info';
        return;
      case 'end information':
        throw new TouchstoneError('[End Information] without [Begin Information].', line);
      case 'network data': {
        beforeData();
        const np = needPorts(line);
        if (args.length) throw new TouchstoneError('[Network Data] takes no argument; the data starts on the next line.', line);
        if (np === 2 && order === null) {
          // required by the specification but missing in some files (and in its own Example 20)
          order = '21_12';
          notes.push('The 2-port file has no [Two-Port Data Order]; the version 1 order N11 N21 N12 N22 (21_12) was assumed. If the exporter meant 12_21, S21 and S12 are swapped.');
        }
        if (declaredFreqs === null) throw new TouchstoneError('[Number of Frequencies] is required before [Network Data].', line);
        if (declaredNoise !== null && np !== 2) throw new TouchstoneError('noise data is only defined for 2-port files.', line);
        networkSeen = true;
        startNetwork(line);
        return;
      }
      case 'noise data':
        if (phase !== 'network') throw new TouchstoneError('[Noise Data] must follow the network data.', line);
        if (declaredNoise === null) throw new TouchstoneError('[Noise Data] needs [Number of Noise Frequencies].', line);
        endNetwork(line);
        noiseSeen = true;
        phase = 'noise';
        return;
      case 'end':
        if (phase === 'network') endNetwork(line);
        else if (phase !== 'noise') throw new TouchstoneError('[End] before [Network Data].', line);
        phase = 'end';
        return;
      default:
        throw new TouchstoneError(`unknown keyword [${name}].`, line);
    }
  };

  const addReference = (tok: string, line: number) => {
    const v = Number(tok);
    if (!Number.isFinite(v) || !(v > 0)) throw new TouchstoneError(`[Reference] values must be positive resistances, not "${tok}".`, line);
    if (reference!.length >= ports!) throw new TouchstoneError(`[Reference] lists more than ${ports} values.`, line);
    reference!.push(v);
  };

  const endNetwork = (line: number) => {
    if (ri !== 0) throw new TouchstoneError(`the last frequency point is incomplete: ${ri - 1} of ${recLen - 1} values after the frequency.`, recLine || line);
    if (declaredFreqs !== null && count !== declaredFreqs) throw new TouchstoneError(`[Number of Frequencies] is ${declaredFreqs}, but the file contains ${count}.`, line);
  };

  // ── line loop ────────────────────────────────────────────────────────────
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let lineNo = 0;
  let bang = text.indexOf('!', pos);
  while (pos <= len) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = len;
    lineNo++;
    if (bang >= 0 && bang < pos) bang = text.indexOf('!', pos);
    const stop = bang >= 0 && bang < end ? bang : end;
    let a = pos;
    while (a < stop && isSpace(text.charCodeAt(a))) a++;
    if (a < stop) {
      const c = text.charCodeAt(a);
      if (c === 91 /* [ */) {
        const close = text.indexOf(']', a);
        if (close < 0 || close >= stop) throw new TouchstoneError('a keyword is missing its closing "]".', lineNo);
        keyword(text.slice(a + 1, close), tokens(text, close + 1, stop), lineNo);
      } else if (c === 35 /* # */) {
        if (phase === 'end') throw new TouchstoneError('content after [End].', lineNo);
        if (!h.optionSeen && phase !== 'info') {
          if (h.version === null) {
            // Touchstone 1.x: the option line is the first non-comment line
            if (phase !== 'start') throw new TouchstoneError('the option line must precede the data.', lineNo);
            h.version = '1.0';
            if (extPorts === null) throw new TouchstoneError('Touchstone 1.x files take their port count from the file extension; name the file .s1p, .s2p, .s4p and so on.', lineNo);
            ports = extPorts;
            if (ports > MAX_PORTS) throw new TouchstoneError(`${ports} ports; this viewer reads up to ${MAX_PORTS}.`, lineNo);
          } else if (phase !== 'header' || seen.has('number of ports')) throw new TouchstoneError('the option line must follow [Version] and precede [Number of Ports].', lineNo);
          readOptionLine(h, tokens(text, a + 1, stop), h.version === '1.0' ? ports : null, lineNo);
          h.optionSeen = true;
          if (h.version === '1.0') {
            if (h.optionR && h.optionR.length > 1) h.version = '1.1';
            startNetwork(lineNo);
          }
        }
        // later option lines are ignored, as the specification requires
      } else if (phase === 'network') {
        let i = a;
        let first = true;
        while (i < stop) {
          while (i < stop && isSpace(text.charCodeAt(i))) i++;
          if (i >= stop) break;
          const s = i;
          while (i < stop && !isSpace(text.charCodeAt(i))) i++;
          const v = Number(text.slice(s, i));
          if (!Number.isFinite(v)) throw new TouchstoneError(`"${text.slice(s, Math.min(i, s + 24))}" is not a number.`, lineNo);
          if (!feed(v, first, lineNo)) {
            noiseLines++;
            break;
          }
          first = false;
        }
      } else if (phase === 'reference') {
        for (const t of tokens(text, a, stop)) addReference(t, lineNo);
        if (reference!.length === ports) phase = 'header';
      } else if (phase === 'noise') {
        noiseLines++;
      } else if (phase === 'info') {
        // information keyword arguments are not interpreted
      } else if (phase === 'end') {
        throw new TouchstoneError('content after [End].', lineNo);
      } else if (phase === 'start') {
        throw new TouchstoneError('data before the option line. A Touchstone 1.x file starts with the "#" option line; a 2.x file with [Version].', lineNo);
      } else {
        throw new TouchstoneError(h.version === '1.0' || h.version === '1.1' ? 'unexpected text.' : 'data outside [Network Data].', lineNo);
      }
    }
    if (end >= len) break;
    pos = end + 1;
  }

  // ── end of file ──────────────────────────────────────────────────────────
  if (h.version === null || !h.optionSeen) throw new TouchstoneError('No option line ("# GHz S MA R 50") found; this is not a Touchstone file.');
  if (phase === 'info') throw new TouchstoneError('[Begin Information] is not closed by [End Information].');
  if (phase === 'reference') throw new TouchstoneError(`[Reference] lists ${reference?.length ?? 0} of ${ports} port reference resistances.`, referenceLine);
  if (v2()) {
    if (!networkSeen) throw new TouchstoneError('The Touchstone 2.x file has no [Network Data] keyword.');
    if (phase !== 'end') throw new TouchstoneError('The Touchstone 2.x file does not end with [End].');
    if (declaredNoise !== null && !noiseSeen) throw new TouchstoneError('[Number of Noise Frequencies] is given but there is no [Noise Data].');
  } else if (phase === 'network') endNetwork(lineNo);
  if (count === 0) throw new TouchstoneError('No network data found.');

  const np = n;
  const optionRefs = h.optionR ?? [50];
  const refs = reference ?? (optionRefs.length === np ? optionRefs : Array.from({ length: np }, () => optionRefs[0]));
  const out: Network = {
    ports: np,
    freq: freq.slice(0, count),
    re: re.slice(0, count * np * np),
    im: im.slice(0, count * np * np),
    referenceOhms: refs,
    version: h.version,
    format: h.format,
    parameter: h.parameter,
    matrix,
    twoPortOrder: v2() && np === 2 ? order : null,
    noiseLines,
    notes,
  };
  if (noiseLines) notes.push(`${noiseLines} noise-parameter line${noiseLines === 1 ? '' : 's'} skipped; noise data is not shown.`);
  if (h.parameter === 'Y' || h.parameter === 'Z') convertToS(out, !v2(), notes);
  return out;
}

// ── Y / Z to S ─────────────────────────────────────────────────────────────

/** In-place Gauss–Jordan inverse of an n×n complex matrix; returns false when singular. */
function invert(n: number, ar: Float64Array, ai: Float64Array, br: Float64Array, bi: Float64Array): boolean {
  // b = identity
  br.fill(0);
  bi.fill(0);
  for (let i = 0; i < n; i++) br[i * n + i] = 1;
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.hypot(ar[i], ai[i]));
  if (!(scale > 0)) return false;
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = 0;
    for (let r = c; r < n; r++) {
      const m = Math.hypot(ar[r * n + c], ai[r * n + c]);
      if (m > best) {
        best = m;
        p = r;
      }
    }
    if (!(best > scale * 1e-14)) return false;
    if (p !== c) {
      for (let k = 0; k < n; k++) {
        let t = ar[c * n + k]; ar[c * n + k] = ar[p * n + k]; ar[p * n + k] = t;
        t = ai[c * n + k]; ai[c * n + k] = ai[p * n + k]; ai[p * n + k] = t;
        t = br[c * n + k]; br[c * n + k] = br[p * n + k]; br[p * n + k] = t;
        t = bi[c * n + k]; bi[c * n + k] = bi[p * n + k]; bi[p * n + k] = t;
      }
    }
    // 1 / pivot
    const pr = ar[c * n + c], pi = ai[c * n + c];
    const d = pr * pr + pi * pi;
    const qr = pr / d, qi = -pi / d;
    for (let k = 0; k < n; k++) {
      let xr = ar[c * n + k], xi = ai[c * n + k];
      ar[c * n + k] = xr * qr - xi * qi;
      ai[c * n + k] = xr * qi + xi * qr;
      xr = br[c * n + k]; xi = bi[c * n + k];
      br[c * n + k] = xr * qr - xi * qi;
      bi[c * n + k] = xr * qi + xi * qr;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const fr = ar[r * n + c], fi = ai[r * n + c];
      if (fr === 0 && fi === 0) continue;
      for (let k = 0; k < n; k++) {
        ar[r * n + k] -= fr * ar[c * n + k] - fi * ai[c * n + k];
        ai[r * n + k] -= fr * ai[c * n + k] + fi * ar[c * n + k];
        br[r * n + k] -= fr * br[c * n + k] - fi * bi[c * n + k];
        bi[r * n + k] -= fr * bi[c * n + k] + fi * br[c * n + k];
      }
    }
  }
  return true;
}

/**
 * Converts Y or Z data to S for real reference resistances R_i, from the power waves
 * a_i = (V_i + R_i I_i)/(2√R_i), b_i = (V_i − R_i I_i)/(2√R_i):
 *   S = D (Z − R)(Z + R)⁻¹ D⁻¹ = D (I − RY)(I + RY)⁻¹ D⁻¹,  D = diag(1/√R_i).
 * Version 1.x data is normalised to the option-line reference, so R = I there.
 */
function convertToS(net: Network, normalised: boolean, notes: string[]) {
  const n = net.ports;
  const refs = net.referenceOhms;
  if (normalised && refs.some((r) => r !== refs[0])) {
    throw new TouchstoneError(`Touchstone 1.1 ${net.parameter}-parameters normalised to different per-port references cannot be converted unambiguously. Export S-parameters instead.`);
  }
  const R = normalised ? refs.map(() => 1) : refs;
  const sq = R.map(Math.sqrt);
  const nn = n * n;
  const ar = new Float64Array(nn), ai = new Float64Array(nn);
  const br = new Float64Array(nn), bi = new Float64Array(nn);
  const vr = new Float64Array(nn), vi = new Float64Array(nn);
  const isZ = net.parameter === 'Z';
  for (let k = 0; k < net.freq.length; k++) {
    const base = k * nn;
    // A = Z − R, B = Z + R   or   A = I − RY, B = I + RY
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = net.re[base + i * n + j], y = net.im[base + i * n + j];
        const diag = i === j ? 1 : 0;
        if (isZ) {
          ar[i * n + j] = x - diag * R[i]; ai[i * n + j] = y;
          br[i * n + j] = x + diag * R[i]; bi[i * n + j] = y;
        } else {
          ar[i * n + j] = diag - R[i] * x; ai[i * n + j] = -R[i] * y;
          br[i * n + j] = diag + R[i] * x; bi[i * n + j] = R[i] * y;
        }
      }
    }
    if (!invert(n, br, bi, vr, vi)) throw new TouchstoneError(`The ${net.parameter}-matrix at ${describeValue(net.freq[k] / 1e9)} GHz cannot be converted to S (the matrix ${isZ ? 'Z + R' : 'I + RY'} is singular).`);
    // S = D · A · B⁻¹ · D⁻¹
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sr = 0, si = 0;
        for (let m = 0; m < n; m++) {
          const xr = ar[i * n + m], xi = ai[i * n + m], yr = vr[m * n + j], yi = vi[m * n + j];
          sr += xr * yr - xi * yi;
          si += xr * yi + xi * yr;
        }
        const f = sq[j] / sq[i];
        if (!Number.isFinite(sr) || !Number.isFinite(si)) throw new TouchstoneError(`The ${net.parameter}-matrix at ${describeValue(net.freq[k] / 1e9)} GHz cannot be converted to S.`);
        net.re[base + i * n + j] = sr * f;
        net.im[base + i * n + j] = si * f;
      }
    }
  }
  notes.push(
    normalised
      ? `${net.parameter}-parameters normalised to ${refs[0]} Ω were converted to S-parameters for that reference.`
      : `${net.parameter}-parameters were converted to S-parameters for the reference resistances listed in the file (${refs.join(' / ')} Ω); Touchstone 2.x ${net.parameter}-data itself carries no reference.`,
  );
}
