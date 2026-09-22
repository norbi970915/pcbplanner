/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS, type Stackup } from './stackups';
import { crc32, eagleLayerNumbers, normalise, toAltium, toEagleDru, toKicad, zip } from './stackupExport';

const byId = (id: string) => PRESETS.find((s) => s.id === id)!;
const four = byId('std-4l-8-1080-2'); // two prepreg plies per outer gap
const six = PRESETS.find((s) => s.layers.filter((l) => l.kind === 'copper').length === 6)!;
const twelve = PRESETS.find((s) => s.layers.filter((l) => l.kind === 'copper').length === 12)!;

describe('normalise', () => {
  it('groups plies between copper layers', () => {
    const n = normalise(four);
    expect(n.coppers).toHaveLength(4);
    expect(n.gaps).toHaveLength(3);
    expect(n.gaps[0].plies.map((p) => p.name)).toEqual(['Prepreg 1080', 'Prepreg 7628']);
    expect(n.maskTop && n.maskBottom).toBeTruthy();
  });
  it('rejects stackups no tool can import', () => {
    const bad = (layers: Stackup['layers']) => () => normalise({ id: 'x', name: 'x', layers });
    expect(bad([{ id: 'a', kind: 'copper', name: 'L1', t: 0.035 }])).toThrow(/even number/);
    expect(bad([{ id: 'a', kind: 'copper', name: 'L1', t: 0.035 }, { id: 'b', kind: 'copper', name: 'L2', t: 0.035 }])).toThrow(/touch/);
  });
});

describe('KiCad', () => {
  const [pcb, pro] = toKicad(four);
  it('board file: version 20240108, copper layer names and one dielectric per gap with sublayers', () => {
    expect(pcb.content).toContain('(version 20240108)');
    expect(pcb.content).toContain('(0 "F.Cu" signal)');
    expect(pcb.content).toContain('(1 "In1.Cu" power)');
    expect(pcb.content).toContain('(31 "B.Cu" signal)');
    expect(pcb.content.match(/\(layer "dielectric \d+"/g)).toHaveLength(3);
    expect(pcb.content.match(/addsublayer/g)).toHaveLength(2);
    expect(pcb.content).toContain('(epsilon_r 3.91)');
  });
  it('general thickness is the sum of every item, mask included', () => {
    const sum = four.layers.reduce((a, l) => a + l.t, 0);
    expect(pcb.content).toContain(`(thickness ${Number(sum.toFixed(6))})`);
  });
  it('project file is valid JSON naming itself', () => {
    expect(JSON.parse(pro.content)).toEqual({ meta: { filename: pro.name, version: 1 } });
    expect(pro.name.replace('.kicad_pro', '')).toBe(pcb.name.replace('.kicad_pcb', ''));
  });
});

describe('Altium', () => {
  let n = 0;
  const x = toAltium(four, () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`).content;
  it('every ply is a layer with the prepreg/core type GUID; the via span joins top and bottom copper', () => {
    expect(x.match(/TypeId="1a79611a-039d-4d40-a204-53c26c50f8b5"/g)).toHaveLength(4); // 4 prepreg plies
    expect(x.match(/TypeId="136c62ef-1fa6-4897-ae71-7e797b632b92"/g)).toHaveLength(1);
    expect(x.match(/TypeId="f4eccd87-2cfb-4f37-be50-4f3a272b4d01"/g)).toHaveLength(4);
    const top = /Id="([^"]+)" TypeId="f4eccd87[^"]*" Name="Top Layer"/.exec(x)![1];
    const bot = /Id="([^"]+)" TypeId="f4eccd87[^"]*" Name="Bottom Layer"/.exec(x)![1];
    expect(x).toContain(`StartLayerId="${top}" StopLayerId="${bot}"`);
    const stack = /<Stack Id="([^"]+)"/.exec(x)![1];
    expect(x).toContain(`LayerStackId="${stack}"`);
  });
  it('is well-formed: every opened element is closed', () => {
    const open = (x.match(/<(Layer|Properties|Stack|Stacks|Layers|Branch|Sections|BranchSection|StackupDocument|Stackup|FeatureSet|ViaSpans)(\s[^>]*)?>/g) ?? []).filter((t) => !t.endsWith('/>')).length;
    const close = (x.match(/<\/(Layer|Properties|Stack|Stacks|Layers|Branch|Sections|BranchSection|StackupDocument|Stackup|FeatureSet|ViaSpans)>/g) ?? []).length;
    expect(open).toBe(close);
  });
});

describe('Fusion 360 / EAGLE DRU', () => {
  it('layer numbers: 4 → 1 2 15 16, 6 → 1 2 3 14 15 16', () => {
    expect(eagleLayerNumbers(2)).toEqual([1, 16]);
    expect(eagleLayerNumbers(4)).toEqual([1, 2, 15, 16]);
    expect(eagleLayerNumbers(6)).toEqual([1, 2, 3, 14, 15, 16]);
    expect(eagleLayerNumbers(16)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
  it('layerSetup, 16 copper and 15 isolation values; isolation at the upper layer number of each gap', () => {
    const t = toEagleDru(four).content;
    expect(t).toContain('layerSetup = (1+2*15+16)');
    const cu = /mtCopper = (.*)/.exec(t)![1].split(' ');
    const iso = /mtIsolate = (.*)/.exec(t)![1].split(' ');
    expect(cu).toHaveLength(16);
    expect(iso).toHaveLength(15);
    expect(cu[0]).toBe('0.035mm');
    expect(cu[1]).toBe('0.0152mm');
    expect(iso[0]).toBe(`${Number((0.084 + 0.2104).toFixed(6))}mm`); // both plies summed
    expect(iso[1]).toBe('0.1mm'); // core between 2 and 15
    expect(iso[14]).toBe(`${Number((0.084 + 0.2104).toFixed(6))}mm`);
  });
  it('is plain ASCII', () => {
    expect(/^[\x20-\x7e\n]*$/.test(toEagleDru(four).content)).toBe(true);
  });
  it('rejects more than 16 copper layers', () => {
    const layers: Stackup['layers'] = [];
    for (let i = 0; i < 18; i++) {
      layers.push({ id: `c${i}`, kind: 'copper', name: `L${i}`, t: 0.035 });
      if (i < 17) layers.push({ id: `d${i}`, kind: 'dielectric', name: 'Prepreg', t: 0.1, er: 4 });
    }
    expect(() => toEagleDru({ id: 'x', name: 'x', layers })).toThrow(/16/);
  });
});

describe('zip', () => {
  it('CRC-32 of "123456789" is CBF43926', () => expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));
  it('writes local headers, a central directory and the end record', () => {
    const z = zip([
      { name: 'a.txt', content: 'hello' },
      { name: 'b.txt', content: 'world!' },
    ]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(2);
  });
});

// Writes sample exports for checking with the real tools (KiCad CLI) when EXPORT_DIR is set.
it.runIf(!!process.env.EXPORT_DIR)('write samples', () => {
  const dir = process.env.EXPORT_DIR!;
  mkdirSync(dir, { recursive: true });
  const eight = PRESETS.find((s) => s.layers.filter((l) => l.kind === 'copper').length === 8)!;
  const two = PRESETS.find((s) => s.layers.filter((l) => l.kind === 'copper').length === 2)!;
  for (const s of [two, four, six, eight, twelve]) {
    for (const f of toKicad(s)) writeFileSync(`${dir}/${f.name}`, f.content);
    const a = toAltium(s);
    writeFileSync(`${dir}/${a.name}`, a.content);
    const d = toEagleDru(s);
    writeFileSync(`${dir}/${d.name}`, d.content);
  }
  writeFileSync(`${dir}/bundle.zip`, zip(toKicad(four)));
});
