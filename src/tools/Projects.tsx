import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel, Section } from '../components/ui';
import { parseProjectFile, projectStore, serialiseProjects, useProjects, type Project } from '../state/projectStore';
import { stackupStore, useStackups } from '../state/stackupStore';
import { toolByPath } from './registry';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (s: string) => `${s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'projects'}.pcbplanner.json`;
const when = (t: number) => new Date(t).toLocaleString();

export default function Projects() {
  const { projects, activeId } = useProjects();
  const stackups = useStackups();
  const custom = stackups.filter((s) => !s.builtin);
  const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportOne = (p: Project) => {
    download(fileName(p.name), serialiseProjects([p], custom));
    setMsg({ text: `Saved ${fileName(p.name)}. It holds the project and your custom stackups.` });
  };
  const onFile = async (file: File) => {
    const r = parseProjectFile(await file.text());
    if ('error' in r) return setMsg({ text: r.error, error: true });
    projectStore.import(r.projects);
    const known = new Set(stackups.map((s) => s.id));
    let added = 0;
    for (const s of r.stackups)
      if (!known.has(s.id)) {
        stackupStore.save(s);
        added++;
      }
    setMsg({ text: `Imported ${r.projects.length} project${r.projects.length > 1 ? 's' : ''}${added ? ` and ${added} stackup${added > 1 ? 's' : ''}` : ''}.` });
  };

  const properties = (
    <>
      <Section title="Projects">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="pr-a">
            Active
          </label>
          <select id="pr-a" className="fld w-[176px]" value={active?.id ?? ''} onChange={(e) => projectStore.setActive(e.target.value || null)}>
            {!projects.length && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="pr-n">
            New project
          </label>
          <input id="pr-n" className="fld w-[176px]" placeholder="Board name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap justify-end gap-1 pt-0.5">
          <button
            className="btn btn-primary"
            onClick={() => {
              const p = projectStore.create(name);
              setName('');
              setMsg({ text: `Created “${p.name}”. Open a tool, set it up, then use File → Save Tool to Project.` });
            }}
          >
            Create
          </button>
        </div>
      </Section>
      <Section title="File">
        <div className="flex flex-wrap justify-end gap-1">
          <button className="btn" disabled={!active} onClick={() => active && exportOne(active)}>
            Export Project
          </button>
          <button className="btn" disabled={!projects.length} onClick={() => download(fileName('all-projects'), serialiseProjects(projects, custom))}>
            Export All
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
        <p className="text-faint">Projects live in this browser. Export a file to keep a copy, move it to another computer or send it to someone else.</p>
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Projects"
      description="Save the inputs of every calculator for a board under one name, come back to them later, and export or import them as a project file. Everything stays in your browser."
      properties={properties}
      status={projects.length ? `${projects.length} project${projects.length > 1 ? 's' : ''}${active ? ` · active: ${active.name}` : ''}` : 'No projects yet'}
      method={<Method />}
    >
      {msg && <Notes kind={msg.error ? 'error' : 'note'} items={[msg.text]} />}
      {!projects.length && (
        <Panel title="Projects">
          <div className="prose-doc px-4 py-3">
            <p>A project keeps the inputs of each calculator for one board: the stackup you chose, the impedance geometry, the loss setup, the regulator numbers, and so on.</p>
            <ol>
              <li>Create a project in the Properties panel.</li>
              <li>Open any tool and set it up.</li>
              <li>Use <b>File → Save Tool to Project</b>. Repeat for each tool you use.</li>
              <li>Come back here to reopen them, or export the project to a file.</li>
            </ol>
          </div>
        </Panel>
      )}
      {active && (
        <Panel
          title={active.name}
          right={
            <span className="flex gap-1">
              <button
                className="btn"
                onClick={() => {
                  const n = window.prompt('Project name', active.name);
                  if (n !== null) projectStore.rename(active.id, n);
                }}
              >
                Rename
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm(`Delete “${active.name}”? This cannot be undone.`)) projectStore.remove(active.id);
                }}
              >
                Delete
              </button>
            </span>
          }
        >
          {active.tools.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Saved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...active.tools]
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map((t) => (
                    <tr key={t.path}>
                      <td>
                        <Link to={`${t.path}${t.query ? `?${t.query}` : ''}`}>{toolByPath(t.path)?.title ?? t.path}</Link>
                        {t.note && <div className="text-faint">{t.note}</div>}
                      </td>
                      <td className="text-muted">{when(t.updated)}</td>
                      <td className="text-right">
                        <button className="btn" onClick={() => projectStore.removeTool(active.id, t.path)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="px-2.5 py-2 text-muted">
              Nothing saved yet. Open a tool, set your inputs, then use <b>File → Save Tool to Project</b>.
            </p>
          )}
          <p className="px-2.5 py-1.5 text-faint">
            Created {when(active.created)} · last change {when(active.updated)}
          </p>
        </Panel>
      )}
      {projects.length > 1 && (
        <Panel title="All Projects" className="mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th className="v">Tools</th>
                <th>Last change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={p.id === active?.id ? 'sel' : ''}>
                  <td>{p.name}</td>
                  <td className="v">{p.tools.length}</td>
                  <td className="text-muted">{when(p.updated)}</td>
                  <td className="text-right">
                    <span className="flex justify-end gap-1">
                      <button className="btn" onClick={() => projectStore.setActive(p.id)}>
                        Open
                      </button>
                      <button className="btn" onClick={() => exportOne(p)}>
                        Export
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>What a project holds</h2>
      <p>
        Every calculator keeps its inputs in its own web address, which is why any result can be shared as a link. A project is simply a named list of those states: the impedance
        geometry for a board, its loss setup, the regulator and thermal numbers, and so on, one entry per tool. Saving a tool again replaces its earlier entry, so a project always
        holds the current version.
      </p>
      <h2>Where it is stored</h2>
      <p>
        In your browser, on this device. Nothing is uploaded, there is no account and no server: the site has no database at all. That also means a project is only on the computer
        and browser where you made it, and clearing site data removes it.
      </p>
      <h2>Project files</h2>
      <p>
        <b>Export</b> writes a small JSON file holding the projects and your custom stackups, so it opens complete on another machine. <b>Import</b> merges a file into this browser;
        projects with a name that already exists are kept separately, so nothing is overwritten. Use a file to back up your work, move it between computers, or send a board setup to
        a colleague.
      </p>
      <p>The format is plain JSON with a version number, so older files keep working when the site changes.</p>
    </>
  );
}
