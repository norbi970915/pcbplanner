import { useId, useRef, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight, X } from 'lucide-react';
import { Button } from './shadcn/button';
import { Input } from './shadcn/input';
import { projectStore, type Project } from '../state/projectStore';

export function CreateProjectDialog({
  children, onCreated, open, onOpenChange,
  description = 'Give your board a name, then save calculator setups to it as you work.',
  submitLabel = 'Create project',
}: {
  children?: ReactNode;
  onCreated: (project: Project) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  description?: string;
  submitLabel?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const changeOpen = (next: boolean) => {
    setName('');
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  return <Dialog.Root open={open ?? internalOpen} onOpenChange={changeOpen}>
    {children && <Dialog.Trigger asChild>{children}</Dialog.Trigger>}
    <Dialog.Portal>
      <Dialog.Overlay className="workspace-dialog-overlay" />
      <Dialog.Content className="project-create-dialog" onOpenAutoFocus={event => {
        event.preventDefault(); nameRef.current?.focus();
      }}>
        <Dialog.Title>Create a project</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        <Dialog.Close asChild>
          <Button className="project-create-close" variant="ghost" size="icon-sm" aria-label="Close project dialog"><X size={16} /></Button>
        </Dialog.Close>
        <form onSubmit={event => {
          event.preventDefault();
          if (!name.trim()) return;
          const project = projectStore.create(name.trim());
          changeOpen(false);
          onCreated(project);
        }}>
          <label htmlFor={id}>Project name</label>
          <Input id={id} ref={nameRef} placeholder="e.g. Motor controller" value={name} onChange={event => setName(event.target.value)} autoComplete="off" required />
          <p className="project-create-note">Stored on this device. You can export a project file to keep a copy or move it to another browser.</p>
          <div className="project-create-actions">
            <Dialog.Close asChild><Button type="button" variant="outline" size="sm">Cancel</Button></Dialog.Close>
            <Button type="submit" size="sm" disabled={!name.trim()}>{submitLabel}<ArrowRight size={14} /></Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
