import { createContext, useContext } from 'react';

export interface ToolActions {
  reset?: () => void;
}

export interface Shell {
  propsEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  /** Narrow screens only: slot above the Properties panel for the tool's title. */
  headEl: HTMLElement | null;
  setActions: (a: ToolActions | null) => void;
}

export const ShellContext = createContext<Shell>({ propsEl: null, statusEl: null, headEl: null, setActions: () => {} });
export const useShell = () => useContext(ShellContext);
