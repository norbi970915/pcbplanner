// Zone and outline polygons of the active KiCad project, for tools that need shapes rather than the
// per-layer zone areas the parsed board keeps (src/lib/kicadPlanes.ts). The store keeps the board text
// only in IndexedDB ('files' record, see kicadProjectStore.ts), so it is read back from there once the
// project is saved, and parsed once per board. When the project lives in memory only (no IndexedDB),
// the geometry is unavailable and the tool falls back to the zone areas.
import { useEffect, useState } from 'react';
import { readBoardGeometry, type BoardGeometry } from '../lib/kicadPlanes';
import type { KicadBoard } from '../lib/kicadImport';
import type { KicadProjectData } from '../lib/kicadProjectQueries';
import { indexedDbStorage } from './kicadProjectStore';

export type BoardGeometryState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; geom: BoardGeometry } | { status: 'unavailable'; reason: string };

const cache = new WeakMap<KicadBoard, BoardGeometry>();

interface FilesRecord {
  boardName?: string;
  boardText?: string;
}

/** Read and parse the saved board text of `data`; null when the saved text is not this board. */
async function load(data: KicadProjectData): Promise<BoardGeometry | null> {
  const storage = indexedDbStorage();
  if (!storage) return null;
  const rec = (await storage.get('files')) as FilesRecord | undefined;
  const text = rec?.boardText;
  // the saved text must be the parsed board: same name and the same length the parser saw
  if (typeof text !== 'string' || rec?.boardName !== data.boardName || Math.abs(text.length - data.board.stats.bytes) > 1) return null;
  return readBoardGeometry(text, { copper: data.board.copper.map((c) => c.name), bbox: data.board.board.bbox });
}

/**
 * The zone and outline geometry of the active project. `persisted` and `storageNote` come from
 * useKicadProject(): the text is read once the store has saved it.
 */
export function useKicadBoardGeometry(data: KicadProjectData | null, persisted: boolean, storageNote?: string): BoardGeometryState {
  const [state, setState] = useState<{ board: KicadBoard | null; value: BoardGeometryState }>({ board: null, value: { status: 'none' } });
  const hit = data ? cache.get(data.board) : undefined;

  // read once the store has saved the text (persisted); the result is kept per board
  useEffect(() => {
    if (!data || cache.has(data.board) || !persisted) return;
    let live = true;
    load(data).then(
      (g) => {
        if (g) cache.set(data.board, g);
        if (live) setState({ board: data.board, value: g ? { status: 'ready', geom: g } : { status: 'unavailable', reason: 'the saved board text could not be matched to the loaded board' } });
      },
      (e: unknown) => {
        if (live) setState({ board: data.board, value: { status: 'unavailable', reason: e instanceof Error ? e.message : String(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [data, persisted]);

  if (!data) return { status: 'none' };
  if (hit) return { status: 'ready', geom: hit };
  if (state.board === data.board) return state.value;
  if (!persisted && storageNote) return { status: 'unavailable', reason: 'the project is not saved in this browser' };
  return { status: 'loading' };
}
