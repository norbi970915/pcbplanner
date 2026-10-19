/// <reference lib="webworker" />
// Reads the track geometry of a .kicad_pcb off the main thread (see kicadTracks.ts).
import { extractTracks, packTracks, type PackedTracks } from './kicadTracks';

export type KicadTracksResponse = { id: number; ok: true; packed: PackedTracks } | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
  const { id, data } = e.data;
  try {
    const { tracks, read } = extractTracks(new TextDecoder('utf-8').decode(data));
    const packed = packTracks(tracks, read);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, packed } satisfies KicadTracksResponse, [packed.data.buffer]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies KicadTracksResponse);
  }
};
