import { Undo2, Redo2 } from 'lucide-react';
import { Button } from './shadcn/button';
import { useDesignHistory } from '../state/useTrackedState';
import { changeHistory } from '../state/designHistoryStore';
import { useFieldInteraction } from '../state/fieldInteraction';

export function HistoryControls() {
  const history = useDesignHistory();
  const { issues } = useFieldInteraction();
  const draft = history.hasDraft || issues.some(issue => issue.uncommitted);
  if (!history.enabled) return null;
  return <div className="history-controls" role="group" aria-label="Design history">
    <Button type="button" variant="ghost" size="sm" disabled={!history.canUndo && !draft}
      aria-label="Undo last design change" title={draft ? 'Restore last valid inputs' : 'Undo' + (history.undoLabel ? ': ' + history.undoLabel : '') + ' (Ctrl/Cmd+Z)'}
      onClick={() => changeHistory(history.pathname, 'undo')}><Undo2 size={16} /></Button>
    <Button type="button" variant="ghost" size="sm" disabled={!history.canRedo || draft}
      aria-label="Redo last design change" title={'Redo' + (history.redoLabel ? ': ' + history.redoLabel : '') + ' (Ctrl/Cmd+Shift+Z)'}
      onClick={() => changeHistory(history.pathname, 'redo')}><Redo2 size={16} /></Button>
  </div>;
}

