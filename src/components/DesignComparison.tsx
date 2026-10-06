import { Columns2, RefreshCcw, RotateCcw, X } from 'lucide-react';
import { Button } from './shadcn/button';
import { Panel } from './ui';
import { comparisonDelta, comparisonRows, type ComparisonRow } from '../lib/designComparison';
import type { useDesignComparison } from '../state/useDesignComparison';
import { fmt } from '../lib/units';
import { useFieldInteraction } from '../state/fieldInteraction';

type Comparison = ReturnType<typeof useDesignComparison>;

export function ComparisonButton({ comparison }: { comparison: Comparison }) {
  const { issues } = useFieldInteraction();
  return <Button id={comparison.id + '-trigger'} type="button" variant="ghost" size="sm"
    className="comparison-trigger" disabled={!comparison.baseline && (!comparison.ready || issues.length > 0)}
    aria-expanded={comparison.expanded} aria-controls={comparison.baseline ? comparison.id : undefined}
    title={comparison.baseline ? 'Show or hide the saved design comparison' : 'Save these results as a baseline, then change an input to compare'}
    onClick={comparison.toggle}>
    <Columns2 size={14} aria-hidden="true" />{comparison.baseline ? 'Comparing' : 'Compare'}
  </Button>;
}
function value(row?: ComparisonRow): string {
  if (!row || row.value === null) return '—';
  const text = typeof row.value === 'number' ? fmt(row.value, 5) : typeof row.value === 'boolean' ? (row.value ? 'Yes' : 'No') : row.value;
  return text + (row.unit ? ' ' + row.unit : '');
}
function delta(a?: ComparisonRow, b?: ComparisonRow): string {
  const d = comparisonDelta(a, b);
  if (d === null) return '—';
  const unit = b?.unit === '%' ? 'pp' : b?.unit;
  return (d > 0 ? '+' : '') + fmt(d, 4) + (unit ? ' ' + unit : '');
}

export function ComparisonPanel({ comparison }: { comparison: Comparison }) {
  const { issues } = useFieldInteraction();
  const c = { ...comparison, ready: comparison.ready && issues.length === 0 };
  if (!c.baseline || !c.expanded) return null;
  const inputs = comparisonRows(c.baseline.inputs, c.design.inputs).filter(row => row.changed);
  // Never put an old worker result beside the new inputs while a solve is pending.
  const results = comparisonRows(c.baseline.results, c.ready ? c.design.results : []);
  return <section id={c.id} className="design-comparison" aria-label="Design comparison" tabIndex={-1}>
    <Panel title="Design comparison" allowInvalid right={<Button type="button" variant="ghost" size="sm" onClick={c.close} aria-label="Close comparison"><X size={15} /></Button>}>
      <div className="comparison-intro">
        <p role="status">{!c.ready ? 'Waiting for valid results for the current design.' : inputs.length ? 'Baseline A stays fixed while you edit design B.' : 'Baseline saved. Change an input to compare the results.'}</p>
        <div className="comparison-actions">
          <Button type="button" variant="outline" size="sm" onClick={c.restore} title="Replace the current inputs with baseline A"><RotateCcw size={13} />Restore A</Button>
          <Button type="button" variant="outline" size="sm" disabled={!c.ready} onClick={c.save}><RefreshCcw size={13} />Replace A with current</Button>
        </div>
      </div>
      <div className="comparison-table-wrap">
        <table className="tbl comparison-table comparison-results"><caption className="sr-only">Saved baseline A and current design B. Change is B minus A.</caption>
          <thead><tr><th scope="col">Result</th><th scope="col">A · Saved</th><th scope="col">B · Current</th><th scope="col">Change B − A</th></tr></thead>
          <tbody>{results.map(row => <tr key={row.id} className={c.ready && row.changed ? 'comparison-changed' : ''}>
            <th scope="row">{row.b?.label ?? row.a?.label}</th><td>{value(row.a)}</td><td>{c.ready ? value(row.b) : '—'}</td><td>{c.ready ? delta(row.a, row.b) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <details className="comparison-inputs" open={inputs.length > 0}>
        <summary>{inputs.length ? inputs.length + ' changed input' + (inputs.length === 1 ? '' : 's') : 'Inputs match the baseline'}</summary>
        {inputs.length > 0 && <div className="comparison-table-wrap"><table className="tbl comparison-table comparison-input-table">
          <thead><tr><th scope="col">Input</th><th scope="col">A · Saved</th><th scope="col">B · Current</th></tr></thead>
          <tbody>{inputs.map(row => <tr key={row.id}><th scope="row">{row.b?.label ?? row.a?.label}</th><td>{value(row.a)}</td><td>{value(row.b)}</td></tr>)}</tbody>
        </table></div>}
      </details>
      <p className="comparison-footnote">Saved in this browser tab. Changes use the units shown; pp means percentage points. A dash means the result is unavailable or uses a different model.</p>
    </Panel>
  </section>;
}
