import { createContext, useContext } from 'react';

export interface ToolActions {
  reset?: () => void;
}

export interface Shell {
  propsEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  setActions: (a: ToolActions | null) => void;
}

export const ShellContext = createContext<Shell>({ propsEl: null, statusEl: null, setActions: () => {} });
export const useShell = () => useContext(ShellContext);
