// Runs the .kicad_pcb reader in a Web Worker (falls back to the main thread where workers are missing).
import { parseKicadBoard, type KicadBoard } from './kicadImport';
import type { KicadWorkerResponse } from './kicadImport.worker';
import type { Stackup } from './stackups';
import { stackupStore } from '../state/stackupStore';

/** Largest board file accepted (KiCad boards with thousands of tracks stay well below this). */
export const MAX_KICAD_BYTES = 200e6;

let nextId = 1;

export async function readKicadFile(file: Blob): Promise<KicadBoard> {
  if (file.size > MAX_KICAD_BYTES) throw new Error(`The file is larger than ${MAX_KICAD_BYTES / 1e6} MB.`);
  const data = await file.arrayBuffer();
  if (typeof Worker === 'undefined') return parseKicadBoard(new TextDecoder('utf-8').decode(data));
  const worker = new Worker(new URL('./kicadImport.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  try {
    return await new Promise<KicadBoard>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadWorkerResponse>) => {
        if (e.data.id !== id) return;
        if (e.data.ok) resolve(e.data.board);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The file could not be read in this browser.'));
      worker.postMessage({ id, data }, [data]);
    });
  } finally {
    worker.terminate();
  }
}

/** A file of a dropped or picked KiCad project, with its path inside the folder. */
export interface ProjectFile {
  file: File;
  name: string;
  path: string;
  size: number;
}

const asProjectFile = (file: File, path?: string): ProjectFile => ({ file, name: file.name, path: path || file.webkitRelativePath || file.name, size: file.size });

/** Files from a file input (several files, or a folder picked with webkitdirectory). */
export const inputFiles = (list: FileList | null): ProjectFile[] => Array.from(list ?? []).map((f) => asProjectFile(f));

// folders that never hold the board: version control, backups, libraries of 3D models
const SKIP_DIR = /^(\.|node_modules$|.*-backups$|.*\.3dshapes$|.*\.pretty$)/i;
const MAX_ENTRIES = 20000;

/**
 * Files of a drop, with folders walked (a whole KiCad project folder). Call it from the drop handler
 * itself: the browser only hands out the entries during the event.
 */
export function droppedFiles(dt: DataTransfer): Promise<ProjectFile[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((e) => !e)) return Promise.resolve(inputFiles(dt.files));
  const out: ProjectFile[] = [];
  let seen = 0;
  const walk = async (e: FileSystemEntry, depth: number): Promise<void> => {
    if (++seen > MAX_ENTRIES) return;
    if (e.isFile) {
      if (!/\.kicad_(pcb|pro)$/i.test(e.name)) return;
      const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
      out.push(asProjectFile(file, e.fullPath.replace(/^\//, '')));
    } else if (e.isDirectory && depth < 6 && !(depth > 0 && SKIP_DIR.test(e.name))) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, depth + 1);
      }
    }
  };
  return Promise.all(entries.map((e) => walk(e as FileSystemEntry, 0))).then(() => out);
}

/**
 * Save an imported stackup to “My stackups” and return its id. The same import is saved once; when a
 * stackup with that id was edited since, the import is saved beside it under a new id.
 */
export function saveImportedStackup(s: Stackup): string {
  const same = (a: Stackup) => JSON.stringify([a.name, a.layers]) === JSON.stringify([s.name, s.layers]);
  const existing = stackupStore.get().find((x) => x.id === s.id);
  if (existing && same(existing)) return s.id;
  const id = existing ? `${s.id}-${Date.now().toString(36)}` : s.id;
  stackupStore.save({ ...s, id });
  return id;
}
