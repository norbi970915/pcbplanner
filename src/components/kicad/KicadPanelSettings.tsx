import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../../state/shell';
import { FieldInteractionContext } from '../../state/fieldInteraction';
import { Section } from '../ui';

/** One set of controls: docked on desktop, above results on a phone, inside the fullscreen board. */
export function KicadPanelSettings({ title, full, children }: { title: string; full: boolean; children: ReactNode }) {
  const { propsEl } = useShell();
  const interaction = useContext(FieldInteractionContext);
  // Layout already places Properties above results on phones. Keeping the same portal also preserves
  // in-progress field edits across a viewport resize and makes the mobile Inputs shortcut work.
  const docked = !!propsEl && !full;
  if (!docked) return <div className={full ? 'max-h-[40vh] shrink-0 overflow-y-auto border-b border-line' : undefined}>{children}</div>;
  return createPortal(<FieldInteractionContext.Provider value={{ ...interaction, inProperties: true }}><Section title={title}>{children}</Section></FieldInteractionContext.Provider>, propsEl!);
}
