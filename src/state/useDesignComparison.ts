import { useEffect, useId, useState } from 'react';
import { decodeComparison, snapshotDesign, type ComparisonDesign, type ComparisonState } from '../lib/designComparison';

export function useDesignComparison<S extends ComparisonState>(tool: string, design: ComparisonDesign<S>, ready: boolean, onRestore: (state: S) => void) {
  const key = 'pcbplanner:comparison:' + tool;
  const [baseline, setBaseline] = useState<ComparisonDesign<S> | null>(() => {
    try { return decodeComparison(sessionStorage.getItem(key), design.state); } catch { return null; }
  });
  const [expanded, setExpanded] = useState(!!baseline);
  const id = useId();
  useEffect(() => {
    try {
      if (baseline) sessionStorage.setItem(key, JSON.stringify({ version: 1, design: baseline }));
      else sessionStorage.removeItem(key);
    } catch { /* comparison still works when browser storage is unavailable */ }
  }, [key, baseline]);
  const save = () => { if (ready) { setBaseline(snapshotDesign(design)); setExpanded(true); } };
  const close = () => {
    setBaseline(null);
    setExpanded(false);
    requestAnimationFrame(() => document.getElementById(id + '-trigger')?.focus());
  };
  const toggle = () => {
    if (baseline && expanded) { setExpanded(false); return; }
    if (!baseline && !ready) return;
    if (baseline) setExpanded(true); else save();
    requestAnimationFrame(() => {
      const panel = document.getElementById(id);
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  };
  return { baseline, design, ready, expanded, id, save, close, toggle,
    restore: () => { if (baseline) onRestore({ ...baseline.state }); },
  };
}
