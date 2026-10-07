import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, Circle, FolderOpen, Save } from 'lucide-react';
import { Button } from './shadcn/button';
import { CreateProjectDialog } from './CreateProjectDialog';
import type { useProjectSave } from '../state/useProjectSave';

export function ProjectSaveBar({ save, settingsOnly = false }: { save: ReturnType<typeof useProjectSave>; settingsOnly?: boolean }) {
  const projectLink = useRef<HTMLAnchorElement>(null);
  if (!save.available) return null;
  const button = <Button type="button" size="sm" disabled={!save.canSave} onClick={save.project ? () => save.save() : undefined}>
    <Save size={14} aria-hidden="true" />{settingsOnly ? 'Save settings to project' : 'Save to project'}
  </Button>;
  return <section className="project-save-bar" aria-label="Save calculation to project" data-save-status={save.status}>
    <div className="project-save-destination">
      <FolderOpen size={16} aria-hidden="true" />
      <div>
        {save.project
          ? <Link ref={projectLink} to="/projects" title={'Open project: ' + save.project.name}>{save.project.name}</Link>
          : <strong>Keep this calculation in a project</strong>}
        <span className="project-save-status" role="status" aria-live="polite" aria-atomic="true">
          {save.matches && save.status !== 'Check inputs' ? <Check size={12} aria-hidden="true" /> : <Circle size={7} aria-hidden="true" />}
          {save.status}
        </span>
      </div>
    </div>
    {save.project ? button : <CreateProjectDialog open={save.creating} onOpenChange={save.setCreating} onCreated={project => { save.save(project.id); requestAnimationFrame(() => projectLink.current?.focus({ preventScroll: true })); }}
      description="Name your project to save this calculation. Your inputs stay in this browser." submitLabel="Create and save">{button}</CreateProjectDialog>}
    {(settingsOnly || !save.persisted) && <p className="project-save-note">{!save.persisted
      ? 'Browser storage is unavailable. Export your project to keep a copy.'
      : 'Saves viewer settings. The Touchstone file must be reopened separately.'}</p>}
  </section>;
}
