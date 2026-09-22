// Stackup export to KiCad, Altium Designer and Autodesk Fusion 360 Electronics / EAGLE.
//
// KiCad: a minimal KiCad 8 board (file version 20240108, opened by KiCad 8, 9 and 10) plus the
//   .kicad_pro that "Board Setup → Import Settings from Another Board" requires next to it.
//   Syntax follows BOARD_STACKUP::FormatBoardStackup and the s-expression parser in KiCad's source.
// Altium: a .stackupx (XML) document for Layer Stack Manager → File → Load Stackup from File,
//   following the published .stackupx structure and the layer-type GUIDs Altium itself writes.
// Fusion 360 / EAGLE: a .dru design-rules file with layerSetup, mtCopper and mtIsolate
//   (Design Rules → File → Load). DRU files carry thicknesses only, not Dk/Df.
import { MASK_DF, DEFAULT_DF, type Layer, type Stackup } from './stackups';

export interface ExportFile {
  name: string;
  content: string;
}

interface Gap {
  plies: Layer[];
}

interface Normalised {
  maskTop?: Layer;
  maskBottom?: Layer;
  coppers: Layer[];
  gaps: Gap[]; // gaps[i] lies between coppers[i] and coppers[i+1]
}

/** Split the stackup into copper layers and the dielectric plies between them; reject what no tool can import. */
export function normalise(s: Stackup): Normalised {
  const ls = s.layers;
  const firstCu = ls.findIndex((l) => l.kind === 'copper');
  const lastCu = ls.length - 1 - [...ls].reverse().findIndex((l) => l.kind === 'copper');
  if (firstCu < 0) throw new Error('The stackup has no copper layers.');
  const coppers = ls.filter((l) => l.kind === 'copper');
  if (coppers.length < 2 || coppers.length % 2) throw new Error('Export needs an even number of copper layers (2, 4, 6, …).');
  const above = ls.slice(0, firstCu);
  const below = ls.slice(lastCu + 1);
  if (above.some((l) => l.kind === 'dielectric') || below.some((l) => l.kind === 'dielectric'))
    throw new Error('A dielectric sits outside the outer copper layers. Only solder mask can be there.');
  if (above.filter((l) => l.kind === 'mask').length > 1 || below.filter((l) => l.kind === 'mask').length > 1) throw new Error('Only one solder mask per side can be exported.');
  const gaps: Gap[] = [];
  let cur: Layer[] = [];
  for (let i = firstCu + 1; i <= lastCu; i++) {
    const l = ls[i];
    if (l.kind === 'copper') {
      if (!cur.length) throw new Error(`Two copper layers touch without a dielectric between them (before “${l.name}”).`);
      gaps.push({ plies: cur });
      cur = [];
    } else if (l.kind === 'mask') throw new Error('A solder mask layer sits between copper layers.');
    else cur.push(l);
  }
  for (const l of ls) if (!(l.t > 0)) throw new Error(`Layer “${l.name}” has no thickness.`);
  return { maskTop: above.find((l) => l.kind === 'mask'), maskBottom: below.find((l) => l.kind === 'mask'), coppers, gaps };
}

/** Plain decimal without float noise: 0.035, 1.065, 4.4. */
export const num = (v: number, digits = 6) => {
  const s = Number(v.toFixed(digits)).toString();
  return s.includes('e') ? v.toFixed(digits) : s;
};
const isCore = (l: Layer) => /core/i.test(l.name);
const dk = (l: Layer) => l.er ?? 4.2;
const dfOf = (l: Layer) => l.df ?? (l.kind === 'mask' ? MASK_DF : DEFAULT_DF);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
/** Plain-ASCII spelling of the typographic characters used in names. */
const ascii = (s: string) => s.replace(/·/g, '-').replace(/×/g, 'x').replace(/[–—]/g, '-').replace(/µ/g, 'u');
const safeName = (s: string) => ascii(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'stackup';

/* ------------------------------------------------------------------ KiCad */

const KICAD_USER_LAYERS = `\t\t(32 "B.Adhes" user "B.Adhesive")
\t\t(33 "F.Adhes" user "F.Adhesive")
\t\t(34 "B.Paste" user)
\t\t(35 "F.Paste" user)
\t\t(36 "B.SilkS" user "B.Silkscreen")
\t\t(37 "F.SilkS" user "F.Silkscreen")
\t\t(38 "B.Mask" user)
\t\t(39 "F.Mask" user)
\t\t(40 "Dwgs.User" user "User.Drawings")
\t\t(41 "Cmts.User" user "User.Comments")
\t\t(42 "Eco1.User" user "User.Eco1")
\t\t(43 "Eco2.User" user "User.Eco2")
\t\t(44 "Edge.Cuts" user)
\t\t(45 "Margin" user)
\t\t(46 "B.CrtYd" user "B.Courtyard")
\t\t(47 "F.CrtYd" user "F.Courtyard")
\t\t(48 "B.Fab" user)
\t\t(49 "F.Fab" user)`;

export function toKicad(s: Stackup): ExportFile[] {
  const n = normalise(s);
  if (n.coppers.length > 32) throw new Error('KiCad supports at most 32 copper layers.');
  const N = n.coppers.length;
  const cuName = (i: number) => (i === 0 ? 'F.Cu' : i === N - 1 ? 'B.Cu' : `In${i}.Cu`);
  const cuId = (i: number) => (i === N - 1 ? 31 : i);
  const layers = n.coppers.map((c, i) => `\t\t(${cuId(i)} "${cuName(i)}" ${c.role === 'plane' ? 'power' : 'signal'})`).join('\n');

  const items: string[] = ['\t\t\t(layer "F.SilkS" (type "Top Silk Screen"))', '\t\t\t(layer "F.Paste" (type "Top Solder Paste"))'];
  const mask = (m: Layer, side: 'F' | 'B') =>
    `\t\t\t(layer "${side}.Mask" (type "${side === 'F' ? 'Top' : 'Bottom'} Solder Mask") (thickness ${num(m.t)}) (material "Solder Resist") (epsilon_r ${num(dk(m), 4)}) (loss_tangent ${num(dfOf(m), 5)}))`;
  if (n.maskTop) items.push(mask(n.maskTop, 'F'));
  n.coppers.forEach((c, i) => {
    items.push(`\t\t\t(layer "${cuName(i)}" (type "copper") (thickness ${num(c.t)}))`);
    const gap = n.gaps[i];
    if (!gap) return;
    // one dielectric item per gap; further plies are sublayers of it
    const subs = gap.plies.map((p) => `(thickness ${num(p.t)}) (material "${esc(p.name || 'FR4')}") (epsilon_r ${num(dk(p), 4)}) (loss_tangent ${num(dfOf(p), 5)})`);
    items.push(`\t\t\t(layer "dielectric ${i + 1}" (type "${isCore(gap.plies[0]) ? 'core' : 'prepreg'}") ${subs.join('\n\t\t\t\taddsublayer ')})`);
  });
  if (n.maskBottom) items.push(mask(n.maskBottom, 'B'));
  items.push('\t\t\t(layer "B.Paste" (type "Bottom Solder Paste"))', '\t\t\t(layer "B.SilkS" (type "Bottom Silk Screen"))');

  // KiCad's stackup thickness counts every item with a thickness, including the mask
  const total = [n.maskTop, ...n.coppers, ...n.gaps.flatMap((g) => g.plies), n.maskBottom].reduce((a, l) => a + (l ? l.t : 0), 0);
  const base = safeName(s.name);
  const pcb = `(kicad_pcb
\t(version 20240108)
\t(generator "pcbplanner")
\t(generator_version "8.0")
\t(general
\t\t(thickness ${num(total)})
\t\t(legacy_teardrops no)
\t)
\t(paper "A4")
\t(title_block
\t\t(title "${esc(s.name)} stackup")
\t\t(comment 1 "Exported from pcbplanner.com")
\t)
\t(layers
${layers}
${KICAD_USER_LAYERS}
\t)
\t(setup
\t\t(stackup
${items.join('\n')}
\t\t\t(dielectric_constraints no)
\t\t)
\t\t(pad_to_mask_clearance 0)
\t\t(allow_soldermask_bridges_in_footprints no)
\t)
\t(net 0 "")
)
`;
  const pro = JSON.stringify({ meta: { filename: `${base}.kicad_pro`, version: 1 } }, null, 2) + '\n';
  return [
    { name: `${base}.kicad_pcb`, content: pcb },
    { name: `${base}.kicad_pro`, content: pro },
  ];
}

/* ------------------------------------------------------------------ Altium */

const T_OVERLAY = 'c7ef040e-8d00-490b-b00c-a7e7823ff174';
const T_MASK = '7b384237-13d8-4318-8bcb-accd8d9a51e7';
const T_SIGNAL = 'f4eccd87-2cfb-4f37-be50-4f3a272b4d01';
const T_PREPREG = '1a79611a-039d-4d40-a204-53c26c50f8b5';
const T_CORE = '136c62ef-1fa6-4897-ae71-7e797b632b92';
const PLACEMENT_TYPE = 'Altium.LayerStackManager.LayerSchema.ComponentPlacement, Altium.LayerStackManager.Abstractions, Version=1.0.0.0, Culture=neutral, PublicKeyToken=51600b9dd346ed18';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toAltium(s: Stackup, uuid: () => string = () => crypto.randomUUID()): ExportFile {
  const n = normalise(s);
  const N = n.coppers.length;
  const out: string[] = [];
  const layer = (type: string, name: string, props: string[], id = uuid()) =>
    out.push(
      props.length
        ? `        <Layer Id="${id}" TypeId="${type}" Name="${xml(name)}" IsShared="True">\n          <Properties>\n${props.map((p) => `            ${p}`).join('\n')}\n          </Properties>\n        </Layer>`
        : `        <Layer Id="${id}" TypeId="${type}" Name="${xml(name)}" IsShared="True">\n          <Properties />\n        </Layer>`,
    );
  const maskProps = (m: Layer) => [
    `<Property Name="Thickness" Type="DimValue" Dimension="Length">${num(m.t)}mm</Property>`,
    `<Property Name="Material" Type="String">Solder Resist</Property>`,
    `<Property Name="DielectricConstant" Type="DimValue" Dimension="Dimensionless">${num(dk(m), 4)}</Property>`,
  ];
  const dielProps = (p: Layer) => [
    `<Property Name="Material" Type="String">${xml(p.name || 'FR-4')}</Property>`,
    `<Property Name="DielectricConstant" Type="DimValue" Dimension="Dimensionless">${num(dk(p), 4)}</Property>`,
    `<Property Name="LossTangent" Type="DimensionlessValue">${num(dfOf(p), 5)}</Property>`,
    `<Property Name="Thickness" Type="LengthValue">${num(p.t)}mm</Property>`,
  ];
  const topId = uuid();
  const botId = uuid();

  layer(T_OVERLAY, 'Top Overlay', []);
  if (n.maskTop) layer(T_MASK, 'Top Solder', maskProps(n.maskTop));
  let d = 0;
  n.coppers.forEach((c, i) => {
    const name = i === 0 ? 'Top Layer' : i === N - 1 ? 'Bottom Layer' : `Inner Layer ${i}`;
    layer(
      T_SIGNAL,
      name,
      [
        `<Property Name="Thickness" Type="LengthValue">${num(c.t)}mm</Property>`,
        `<Property Name="CopperOrientation" Type="Int32">0</Property>`,
        `<Property Name="ComponentPlacement" Type="${PLACEMENT_TYPE}">${i === 0 ? 'BodyUp' : i === N - 1 ? 'BodyDown' : 'None'}</Property>`,
      ],
      i === 0 ? topId : i === N - 1 ? botId : uuid(),
    );
    for (const p of n.gaps[i]?.plies ?? []) layer(isCore(p) ? T_CORE : T_PREPREG, `Dielectric ${++d}`, dielProps(p));
  });
  if (n.maskBottom) layer(T_MASK, 'Bottom Solder', maskProps(n.maskBottom));
  layer(T_OVERLAY, 'Bottom Overlay', []);

  const stackId = uuid();
  const doc = `<?xml version="1.0" encoding="utf-8"?>
<StackupDocument SerializerVersion="1.1.0.0" Version="2.1.0.0" Id="${uuid()}" RevisionId="${uuid()}" RevisionDate="${new Date().toISOString().replace(/\.\d+Z$/, '.0000000Z')}" xmlns="http://altium.com/ns/LayerStackManager">
  <FeatureSet>
    <Feature Id="c8939e8a-fd0e-4d52-8860-b7a98f452016">Standard Stackup</Feature>
    <Feature Id="e3df2b86-5f1b-49ca-b266-d1ae57f0ba6f">Impedance Calculator</Feature>
  </FeatureSet>
  <TypeExtensions />
  <Stackup Type="Standard" RoughnessType="MHammerstad" RoughnessFactorSR="1um" RoughnessFactorRF="2%" RealisticRatio="True" CopperResistance="17.24nohm" ViaPlatingThickness="18um" AmbientTemperature="20C" TemperatureRise="50C">
    <Stacks>
      <Stack Id="${stackId}" Name="Board Layer Stack" IsSymmetric="False" TemplateId="4f86428c-8079-42f7-936e-755c6ea7c339">
        <Layers>
${out.join('\n')}
        </Layers>
        <ViaSpans>
          <ViaSpan Id="${uuid()}" AutoName="Thru 1:${N}" Type="ThruVia" StartLayerId="${topId}" StopLayerId="${botId}" />
        </ViaSpans>
        <DrillSpans />
      </Stack>
    </Stacks>
    <ImpedanceProfiles />
    <Branches>
      <Branch Id="${uuid()}" Name="Board" Description="">
        <Sections>
          <BranchSection Id="${uuid()}" Name="Branch Section-1">
            <Stacks>
              <BranchSectionStack Id="${uuid()}" LayerStackId="${stackId}" Description="Board Layer Stack" MaterialUsage="Common" Source="Design" IsLeftIntrusionsLinked="True" IntrusionLeftBottom="0m" IntrusionLeftTop="0m" IsRightIntrusionsLinked="True" IntrusionRightBottom="0m" IntrusionRightTop="0m" />
            </Stacks>
          </BranchSection>
        </Sections>
      </Branch>
    </Branches>
  </Stackup>
</StackupDocument>
`;
  return { name: `${safeName(s.name)}.stackupx`, content: doc };
}

/* ------------------------------------------------------------------ Fusion 360 / EAGLE */

/** EAGLE layer numbers for N copper layers: top half 1, 2, 3…, bottom half …, 14, 15, 16. */
export function eagleLayerNumbers(N: number): number[] {
  const half = N / 2;
  return Array.from({ length: N }, (_, i) => (i < half ? i + 1 : 16 - (N - 1 - i)));
}

export function toEagleDru(s: Stackup): ExportFile {
  const n = normalise(s);
  const N = n.coppers.length;
  if (N > 16) throw new Error('Fusion 360 / EAGLE support at most 16 copper layers.');
  const nums = eagleLayerNumbers(N);
  let setup = String(nums[0]);
  n.gaps.forEach((g, i) => {
    setup += (g.plies.every(isCore) ? '*' : '+') + nums[i + 1];
  });
  setup = `(${setup})`;
  const inner = n.coppers[1] && N > 2 ? n.coppers[1].t : n.coppers[0].t;
  const copper = Array.from({ length: 16 }, () => inner);
  nums.forEach((ln, i) => (copper[ln - 1] = n.coppers[i].t));
  const gapT = n.gaps.map((g) => g.plies.reduce((a, p) => a + p.t, 0));
  const iso = Array.from({ length: 15 }, () => gapT[Math.floor(gapT.length / 2)]);
  n.gaps.forEach((_, i) => (iso[nums[i] - 1] = gapT[i]));
  const mm = (v: number) => `${num(v)}mm`;
  const summary = n.coppers
    .map((c, i) => {
      const g = n.gaps[i];
      return `${c.name} ${num(c.t * 1000, 1)} um` + (g ? `, ${g.plies.map((p) => `${p.name} ${num(p.t)} mm Dk ${num(dk(p), 3)} Df ${num(dfOf(p), 4)}`).join(' + ')}` : '');
    })
    .join('<br>');
  const text = `description[en] = <b>${xml(ascii(s.name))}</b> - layer stack exported from pcbplanner.com\\n<p>\\nThis file sets the layer stack only (layer setup, copper and isolation thicknesses).\\n<p>\\n${summary}
layerSetup = ${setup}
mtCopper = ${copper.map(mm).join(' ')}
mtIsolate = ${iso.map(mm).join(' ')}
`;
  // EAGLE-era files: keep them plain ASCII
  return { name: `${safeName(s.name)}.dru`, content: text.replace(/[^\x20-\x7e\n]/g, '?') };
}

/* ------------------------------------------------------------------ zip (stored, no compression) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP archive with stored (uncompressed) entries. */
export function zip(files: ExportFile[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const outBuf = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) {
    outBuf.set(a, p);
    p += a.length;
  }
  return outBuf;
}
