import { useEffect } from 'react';
import { useDesignHistory } from './useTrackedState';
import { changeHistory } from './designHistoryStore';

/** Keep native text undo and modal keyboard handling intact. Install once per tool. */
export function useHistoryShortcuts() {
  const history = useDesignHistory();
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || !history.enabled) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
        document.querySelector('[role="dialog"]'))) return;
      const key = event.key.toLowerCase();
      const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && !event.metaKey ? 'redo' : null;
      if (!direction) return;
      if (direction === 'redo' ? !history.canRedo : !history.canUndo && !document.querySelector('[data-uncommitted-input="true"]')) return;
      event.preventDefault();
      changeHistory(history.pathname, direction);
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [history.enabled, history.canUndo, history.canRedo, history.pathname]);
  return history.message;
}
