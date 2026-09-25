export interface LogicLevelsInput {
  vohMin: number;
  volMax: number;
  vohMax: number;
  vihMin: number;
  vilMax: number;
  operatingMax: number; // 0 = not supplied
  absoluteMax: number; // 0 = not supplied
  receiverMayBeOff: boolean;
}

export interface LogicLevelsResult {
  errors: string[];
  failures: string[];
  warnings: string[];
  highMargin: number;
  lowMargin: number;
  highCompatible: boolean;
  lowCompatible: boolean;
  operatingCompatible: boolean | null;
  absoluteCompatible: boolean | null;
  verdict: 'incompatible' | 'review' | 'passes-entered-limits';
}

export function checkLogicLevels(p: LogicLevelsInput): LogicLevelsResult {
  const errors: string[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  if (![p.vohMin, p.volMax, p.vohMax, p.vihMin, p.vilMax, p.operatingMax, p.absoluteMax].every(Number.isFinite)) {
    errors.push('Every voltage must be a finite number.');
  }
  if (p.volMax < 0 || p.vilMax < 0 || p.operatingMax < 0 || p.absoluteMax < 0) errors.push('Low thresholds and optional voltage limits cannot be negative.');
  if (!(p.vohMin > p.volMax && p.vohMax >= p.vohMin)) errors.push('Driver levels must satisfy VOH(max) ≥ VOH(min) > VOL(max).');
  if (!(p.vihMin > p.vilMax)) errors.push('Receiver levels must satisfy VIH(min) > VIL(max).');
  if (p.operatingMax > 0 && p.absoluteMax > 0 && p.absoluteMax < p.operatingMax) errors.push('Absolute maximum input voltage cannot be below the recommended operating limit.');
  if (errors.length) return {
    errors, failures, warnings, highMargin: NaN, lowMargin: NaN, highCompatible: false, lowCompatible: false,
    operatingCompatible: null, absoluteCompatible: null, verdict: 'incompatible',
  };

  const highMargin = p.vohMin - p.vihMin;
  const lowMargin = p.vilMax - p.volMax;
  const highCompatible = highMargin >= 0;
  const lowCompatible = lowMargin >= 0;
  const operatingCompatible = p.operatingMax > 0 ? p.vohMax <= p.operatingMax : null;
  const absoluteCompatible = p.absoluteMax > 0 ? p.vohMax <= p.absoluteMax : null;
  if (!highCompatible) failures.push('Worst-case driver HIGH does not reach the receiver HIGH threshold.');
  if (!lowCompatible) failures.push('Worst-case driver LOW exceeds the receiver LOW threshold.');
  if (highMargin === 0 || lowMargin === 0) warnings.push('A threshold is met exactly, leaving zero static noise margin at that corner.');
  if (operatingCompatible === false) failures.push('The highest driver output exceeds the receiver recommended input limit.');
  if (absoluteCompatible === false) failures.push('The highest driver output exceeds the receiver absolute maximum input rating.');
  if (operatingCompatible === null) warnings.push('Receiver recommended input-voltage limit was not entered.');
  if (absoluteCompatible === null) warnings.push('Receiver absolute maximum input rating was not entered.');
  if (p.receiverMayBeOff) warnings.push('Check the receiver datasheet for powered-off input tolerance and injection current. Powered-on voltage limits do not establish this.');
  const incompatible = !highCompatible || !lowCompatible || operatingCompatible === false || absoluteCompatible === false;
  return {
    errors, failures, warnings, highMargin, lowMargin, highCompatible, lowCompatible, operatingCompatible, absoluteCompatible,
    verdict: incompatible ? 'incompatible' : warnings.length ? 'review' : 'passes-entered-limits',
  };
}
