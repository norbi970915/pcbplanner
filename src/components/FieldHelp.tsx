import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useFieldInteraction } from '../state/fieldInteraction';

/** Pointer users can leave the help; touch and keyboard retain explicit dismissal. */
export function FieldHelp({ label, hint, descriptionId, diagramKey }: { label: ReactNode; hint: string; descriptionId?: string; diagramKey?: string }) {
  const headingId = useId();
  const { setActiveField } = useFieldInteraction();
  const [open, setOpen] = useState(false);
  const interaction = useRef<'pointer' | 'keyboard' | 'touch'>('keyboard');
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };
  const scheduleClose = () => {
    if (interaction.current !== 'pointer') return;
    cancelClose();
    // Allow the pointer to cross the small gap between the button and popup.
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      setOpen(false);
    }, 150);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  return <>
    {descriptionId && <span id={descriptionId} className="sr-only">{hint}</span>}
    <Popover.Root open={open} onOpenChange={next => {
      cancelClose();
      setOpen(next);
      if (next) setActiveField(diagramKey ?? null);
    }}>
      <Popover.Trigger asChild>
        <button type="button" className="field-help-trigger" aria-label={'Help: ' + (typeof label === 'string' ? label : 'input')}
          onPointerDown={event => { interaction.current = event.pointerType === 'touch' ? 'touch' : 'pointer'; }}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          onKeyDown={() => { interaction.current = 'keyboard'; cancelClose(); }}>
          <Info size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="field-help-popover" sideOffset={7} align="end" collisionPadding={12} aria-labelledby={headingId}
          onPointerEnter={cancelClose} onPointerLeave={scheduleClose}
          onKeyDownCapture={() => { interaction.current = 'keyboard'; cancelClose(); }}>
          <div className="field-help-heading"><strong id={headingId}>{label}</strong>
            <Popover.Close className="field-help-close" aria-label="Close field help"><X size={14} aria-hidden="true" /></Popover.Close>
          </div>
          <p>{hint}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </>;
}
