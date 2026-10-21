// Fills the zones of the example board with KiCad itself and keeps KiCad's fill for the generator:
//   node scripts/refill-example.mjs [path to kicad-cli]
// The example board (public/examples/pcbplanner-example-6layer.kicad_pcb, from src/lib/kicadExample.ts) is
// copied without its fills to a temporary folder, KiCad refills its zones (kicad-cli pcb drc --refill-zones
// --save-board), and the (filled_polygon …) lists of every zone, found by the zone's uuid, are written to
// src/lib/kicadExampleFills.ts. Then regenerate the example:
//   WRITE_KICAD_EXAMPLE=1 npx vitest run src/lib/kicadImport.test.ts -t "write the example"
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = process.argv[2] ?? (process.platform === 'win32' ? 'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe' : 'kicad-cli');
const board = 'public/examples/pcbplanner-example-6layer.kicad_pcb';
const out = 'src/lib/kicadExampleFills.ts';

/** The end of the list that opens at i (quotes respected). */
function listEnd(t, i) {
  let depth = 0;
  let q = false;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '"' && t[j - 1] !== '\\') q = !q;
    if (q) continue;
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j + 1;
  }
  return t.length;
}

const dir = mkdtempSync(join(tmpdir(), 'pcbplanner-refill-'));
try {
  const text = readFileSync(board, 'utf8');
  // the zones as the generator writes them, without any fill
  let bare = '';
  for (let i = 0; ; ) {
    const k = text.indexOf('(filled_polygon', i);
    if (k < 0) {
      bare += text.slice(i);
      break;
    }
    let s = k;
    while (s > 0 && (text[s - 1] === '\t' || text[s - 1] === '\n')) s--;
    bare += text.slice(i, s);
    i = listEnd(text, k);
  }
  const file = join(dir, 'example.kicad_pcb');
  writeFileSync(file, bare);
  execFileSync(cli, ['pcb', 'drc', '--refill-zones', '--save-board', '-o', join(dir, 'drc.rpt'), file], { stdio: 'inherit' });
  const filled = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fills = {};
  for (let z = filled.indexOf('\n\t(zone'); z >= 0; z = filled.indexOf('\n\t(zone', z + 1)) {
    const end = listEnd(filled, z + 2);
    const zt = filled.slice(z, end);
    const uuid = /\(uuid "([^"]+)"\)/.exec(zt)?.[1];
    const parts = [];
    for (let k = zt.indexOf('(filled_polygon'); k >= 0; k = zt.indexOf('(filled_polygon', k + 1)) parts.push('\t\t' + zt.slice(k, listEnd(zt, k)));
    if (uuid && parts.length) fills[uuid] = parts.join('\n');
  }
  if (!Object.keys(fills).length) throw new Error('KiCad filled no zone.');
  const kicad = execFileSync(cli, ['version'], { encoding: 'utf8' }).trim();
  writeFileSync(
    out,
    `// KiCad's own fill of the zones of the example board (kicadExample.ts), by zone uuid: written by\n// scripts/refill-example.mjs with kicad-cli ${kicad} (pcb drc --refill-zones). Do not edit.\nexport const EXAMPLE_FILLS: Record<string, string> = ${JSON.stringify(fills, null, 2)};\n`,
  );
  console.log(`${Object.keys(fills).length} zones filled by KiCad ${kicad}; written to ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
