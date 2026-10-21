import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Section } from './ui';
import { useKicadProject } from '../state/kicadProjectStore';
import { projectDrawing } from '../lib/kicadDrawingClient';
import type { BoardDrawing } from '../lib/kicadDrawing';
import { viaImportValues } from '../lib/kicadViaImport';

export function KicadViaSource({ onApply }: { onApply: (patch: { len?: number; hole?: number; pad?: number }) => void }) {
  const { data } = useKicadProject();
  const selectId = useId();
  const [drawing, setDrawing] = useState<{ board: object; d?: BoardDrawing; error?: string } | null>(null);
  const [choice, setChoice] = useState<{ board: object; value: string } | null>(null);
  const [applied, setApplied] = useState<{ board: object; text: string } | null>(null);
  const selection = choice?.board === data?.board ? choice?.value ?? '' : '';
  const note = applied?.board === data?.board ? applied?.text ?? '' : '';
  useEffect(() => {
    let live = true;
    if (data) projectDrawing(data).then(d => live && setDrawing({ board: data.board, d }), e => live && setDrawing({ board: data.board, error: String(e) }));
    return () => { live = false; };
  }, [data]);
  const d = drawing?.board === data?.board ? drawing?.d : undefined;
  const via = selection !== '' ? d?.vias[Number(selection)] : undefined;
  const patch = data ? viaImportValues(data, via) : {};
  return <Section title="From KiCad Project">
    {!data ? <p className="text-faint">No KiCad project loaded. <Link to="/kicad-project">Load a board</Link> to import board thickness or a via.</p> : <>
      <p className="text-faint"><Link to="/kicad-project">{data.boardName}</Link> · {data.board.copper.length} copper layers</p>
      <label className="block text-muted" htmlFor={selectId}>Via to import</label><select id={selectId} className="fld w-full" data-report-ignore value={selection} onChange={e => setChoice({ board: data.board, value: e.target.value })}>
        <option value="">Board thickness only</option>
        {d?.vias.map((v, i) => <option key={i} value={i}>{v.net || 'No net'} · {v.x.toFixed(2)}, {v.y.toFixed(2)} mm · {v.layers.join(' → ')}</option>)}
      </select>
      {!d && !drawing?.error && <p className="text-faint">Reading vias…</p>}
      {drawing?.board === data.board && drawing.error && <p role="alert">{drawing.error}</p>}
      <p className="text-faint">Apply imports the board thickness, or a selected via’s layer span, hole and pad. Plating, dielectric constant and antipad are not read: check them against the fabrication data.</p>
      {via && patch.len === undefined && <p className="text-faint">This via’s layer span cannot be resolved from the stackup; its length will not be changed.</p>}
      {note && <p role="status" className="text-faint">{note}</p>}
      <div className="flex justify-end"><button className="btn" type="button" disabled={!Object.keys(patch).length || (selection !== '' && !via)} onClick={() => { onApply(patch); setApplied({ board: data.board, text: `Applied ${Object.keys(patch).map(k => ({ len: 'length', hole: 'hole', pad: 'pad' })[k]).join(', ')} from ${data.boardName}. Check the remaining assumptions.` }); }}>Apply</button></div>
    </>}
  </Section>;
}
