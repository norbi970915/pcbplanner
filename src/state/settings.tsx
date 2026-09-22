import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'system' | 'light' | 'dark';
export type PrefUnit = 'mm' | 'mil';

interface Settings {
  unit: PrefUnit;
  setUnit: (u: PrefUnit) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<Settings | null>(null);
const KEY = 'pcbtk-settings';

function read(): { unit: PrefUnit; theme: Theme } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      unit: s.unit === 'mil' ? 'mil' : 'mm',
      theme: s.theme === 'light' || s.theme === 'system' ? s.theme : 'dark',
    };
  } catch {
    return { unit: 'mm', theme: 'dark' };
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const initial = read();
  const [unit, setUnit] = useState<PrefUnit>(initial.unit);
  const [theme, setTheme] = useState<Theme>(initial.theme);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ unit, theme }));
    } catch {
      /* storage unavailable */
    }
  }, [unit, theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(() => ({ unit, setUnit, theme, setTheme }), [unit, theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings outside SettingsProvider');
  return c;
}
