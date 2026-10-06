import { useId, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useFieldInteraction } from '../state/fieldInteraction';

/** A click/tap disclosure with managed focus, Escape and outside-click dismissal. */
export function FieldHelp({ label, hint, descriptionId, diagramKey }: { label: ReactNode; hint: string; descriptionId?: string; diagramKey?: string }) {
  const headingId = useId();
  const { setActiveField } = useFieldInteraction();
  return <>
    {descriptionId && <span id={descriptionId} className="sr-only">{hint}</span>}
    <Popover.Root onOpenChange={open => { if (open) setActiveField(diagramKey ?? null); }}>
      <Popover.Trigger asChild>
        <button type="button" className="field-help-trigger" aria-label={'Help: ' + (typeof label === 'string' ? label : 'input')}>
          <Info size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="field-help-popover" sideOffset={7} align="end" collisionPadding={12} aria-labelledby={headingId}>
          <div className="field-help-heading"><strong id={headingId}>{label}</strong>
            <Popover.Close className="field-help-close" aria-label="Close field help"><X size={14} aria-hidden="true" /></Popover.Close>
          </div>
          <p>{hint}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </>;
}
