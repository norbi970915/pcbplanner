import { createContext, useContext } from 'react';

export interface ToolActions {
  reset?: () => void;
  report?: () => void;
}

export interface Shell {
  propsEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  /** Narrow screens only: slot above the Properties panel for the tool's title. */
  headEl: HTMLElement | null;
  setActions: (a: ToolActions | null) => void;
  showInputs: () => void;
  openGuidance: () => void;
  focusMode: boolean;
  toggleFocus: () => void;
}

export const ShellContext = createContext<Shell>({ propsEl: null, statusEl: null, headEl: null, setActions: () => {}, showInputs: () => {}, openGuidance: () => {}, focusMode: false, toggleFocus: () => {} });
export const useShell = () => useContext(ShellContext);
