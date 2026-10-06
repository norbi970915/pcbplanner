import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface FieldIssue { id: string; label: string; message: string; }
interface FieldInteraction {
  activeField: string | null;
  setActiveField: (key: string | null) => void;
  issues: FieldIssue[];
  reportIssue: (id: string, issue?: FieldIssue) => void;
  inProperties?: boolean;
}
const noop = () => {};
export const FieldInteractionContext = createContext<FieldInteraction>({
  activeField: null, setActiveField: noop, issues: [], reportIssue: noop,
});
export const useFieldInteraction = () => useContext(FieldInteractionContext);
export function useFieldInteractionState() {
  const [activeField, setFocusedField] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  const setActiveField = useCallback((key: string | null) => {
    window.clearTimeout(highlightTimer.current);
    setFocusedField(key);
    highlightTimer.current = key === null ? undefined : window.setTimeout(() => {
      highlightTimer.current = undefined;
      setFocusedField(null);
    }, 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);
  const [issueMap, setIssueMap] = useState<Record<string, FieldIssue>>({});
  const reportIssue = useCallback((id: string, issue?: FieldIssue) => {
    setIssueMap(previous => {
      if (!issue && !previous[id]) return previous;
      if (issue && previous[id]?.message === issue.message && previous[id]?.label === issue.label) return previous;
      const next = { ...previous };
      if (issue) next[id] = issue; else delete next[id];
      return next;
    });
  }, []);
  const issues = useMemo(() => Object.values(issueMap), [issueMap]);
  return useMemo(() => ({ activeField, setActiveField, issues, reportIssue }), [activeField, setActiveField, issues, reportIssue]);
}
export function useFieldIssue(id: string | undefined, label: ReactNode, message?: string) {
  const { reportIssue } = useFieldInteraction();
  const name = typeof label === 'string' ? label : 'Input';
  useEffect(() => {
    if (id) reportIssue(id, message ? { id, label: name, message } : undefined);
  }, [id, name, message, reportIssue]);
  useEffect(() => () => { if (id) reportIssue(id); }, [id, reportIssue]);
}

export function useDiagramField(field: string | string[]): boolean {
  const { activeField } = useFieldInteraction();
  return activeField !== null && (Array.isArray(field) ? field.includes(activeField) : field === activeField);
}
