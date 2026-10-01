import type { ReactNode } from 'react';

const symbols: Record<string, ReactNode> = {
    'Signal integrity': <path d="M2 17h5V7h6v10h6V7h3" />,
    RF: <path d="M2 14c3-12 5-12 8 0s5 12 8 0 3-6 4-4" />,
    Stackup: <path d="m2 8 10-5 10 5-10 5ZM2 12l10 5 10-5M2 16l10 5 10-5" />,
    Thermal: <><path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0ZM12 7v11" /><circle cx="12" cy="18" r="1" /></>,
    'Power & conductors': <><path d="M3 16h4l5-8h9M3 20h6l5-8h7" /><circle cx="3" cy="16" r="1" /><circle cx="21" cy="8" r="1" /></>,
    'Power integrity': <path d="M3 4h18M7 4v5m10-5v5M4 9h6m4 0h6M4 13h6m4 0h6M7 13v7m10-7v7M3 20h18" />,
    'Power supply': <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
    Electronics: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" /></>,
    Components: <><path d="M2 12h4m12 0h4" /><rect x="6" y="8" width="12" height="8" rx="1" /></>,
    Utilities: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    Guides: <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />,
};

/** Small circuit symbols for the existing category colours and navigation. */
export function CategoryIcon({ group, size = 16, color, className = '' }: { group: string; size?: number; color?: string; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 ${className}`} style={color ? { color } : undefined} aria-hidden="true" focusable="false">
    {symbols[group] ?? symbols.Utilities}
  </svg>;
}
