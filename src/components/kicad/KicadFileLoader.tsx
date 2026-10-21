import { useEffect, useRef, useState } from 'react';
import { droppedFiles, inputFiles, type ProjectFile } from '../../lib/kicadImportClient';
import { useKicadProject } from '../../state/kicadProjectStore';

/**
 * Loading a KiCad board or project into the shared project store: the drop zone (files, folder,
 * example), the hidden file inputs and drag and drop anywhere on the page (/kicad-project).
 */
export function useKicadFileLoader(onExampleLoaded?: () => void) {
  const kp = useKicadProject();
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const busy = kp.status === 'loading';

  const open = (files: ProjectFile[]) => {
    setDropError(null);
    void kp.load(files);
  };
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  // drag and drop anywhere on the page
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (!e.dataTransfer) return;
      // the entries are only available during the event: start walking the folder now
      void droppedFiles(e.dataTransfer).then(
        (files) => (files.length ? openRef.current(files) : setDropError('The drop held no .kicad_pcb file. Drop the board file of a KiCad project, or the whole project folder.')),
        () => setDropError('The dropped folder could not be read in this browser. Choose the files instead.'),
      );
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  const dropZone = (compact: boolean) => (
    <div className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line px-4 text-center ${compact ? 'py-4' : 'py-10'}`}>
      <p className="text-[15px] font-semibold">Drop your .kicad_pcb file or the whole KiCad project folder</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy} title="One .kicad_pcb, or the .kicad_pcb and .kicad_pro together">
          Choose files
        </button>
        <button type="button" className="btn" onClick={() => folderInput.current?.click()} disabled={busy}>
          Choose folder
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDropError(null);
            void kp.loadExample().then(loaded => { if (loaded) onExampleLoaded?.(); });
          }}
          disabled={busy}
        >
          Try an example
        </button>
      </div>
      <p className="text-muted">The files stay in your browser — nothing is uploaded.</p>
      <p className="text-faint">
        {busy
          ? `Reading ${kp.boardName ?? 'the board'}…`
          : 'KiCad 6 to 10. From the .kicad_pcb: stackup, layers, outline, zones, tracks and vias; from the .kicad_pro (optional): the net classes. Other files are ignored.'}
      </p>
    </div>
  );

  const inputs = (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-[var(--accent)]" style={{ background: 'color-mix(in srgb, var(--doc) 80%, transparent)' }}>
          <span className="border border-line bg-sheet px-3 py-2 font-semibold">Drop the .kicad_pcb file or the project folder</span>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".kicad_pcb,.kicad_pro"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a KiCad board file, or the board and project files"
        onChange={(e) => {
          const files = inputFiles(e.target.files);
          if (files.length) open(files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        // a folder pick: React passes the attribute through as it is
        {...{ webkitdirectory: '', directory: '' }}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a KiCad project folder"
        onChange={(e) => {
          const files = inputFiles(e.target.files);
          if (files.length) open(files);
          e.target.value = '';
        }}
      />
    </>
  );

  const errors = [kp.error, dropError].filter((x): x is string => !!x);
  return { kp, dropZone, inputs, busy, errors };
}
