import { useCallback, useState } from 'react';
import { normaliseToolQuery } from '../lib/toolInputs';
import { currentToolUrl } from '../lib/toolUrl';
import { projectStore, useProjects } from './projectStore';
import { toolInputsStore, useToolInputs } from './toolInputsStore';

export function useProjectSave(path: string, blocked: boolean) {
  const inputs = useToolInputs(path);
  const { projects, activeId } = useProjects();
  const project = projects.find(item => item.id === activeId);
  const entry = project?.tools.find(item => item.path === path);
  const matches = !!inputs && !!entry && normaliseToolQuery(entry.query, inputs.defaults) === inputs.query;
  const persisted = projectStore.isPersisted();
  const [creating, setCreating] = useState(false);
  const available = !!inputs;
  const canSave = available && !blocked && (!matches || !persisted);
  const status = blocked ? 'Check inputs' : matches ? (persisted ? 'Saved' : 'Saved for this session') : entry ? 'Unsaved changes' : 'Not saved';
  const save = useCallback((id?: string) => {
    if (blocked) return;
    const current = toolInputsStore.get(path);
    if (!current) return;
    const snapshot = projectStore.get();
    const target = snapshot.projects.find(item => item.id === (id ?? snapshot.activeId));
    if (!target) { setCreating(true); return; }
    const note = target.tools.find(item => item.path === path)?.note;
    currentToolUrl();
    projectStore.saveTool(target.id, path, current.savedQuery, note);
  }, [blocked, path]);
  return { available, canSave, status, matches, persisted, project, save, creating, setCreating };
}
