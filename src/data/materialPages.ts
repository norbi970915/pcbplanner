// One page per laminate or solder-mask product, built only from the verified entries in laminates.ts.
// A product with several datasheet entries (constructions, glass styles) shares one page.
import { LAMINATES, MASKS, type Laminate } from './laminates';

export interface MaterialPageDef {
  slug: string;
  product: string; // as the manufacturer writes it
  vendor: string;
  ids: string[]; // entries of LAMINATES or MASKS, the first is the headline value
  /** headline wording when the datasheet gives a range rather than one value */
  range?: string;
}

export const MATERIAL_PAGES: MaterialPageDef[] = [
  { slug: 'megtron-6', product: 'MEGTRON 6', vendor: 'Panasonic', ids: ['megtron6', 'megtron6n'] },
  { slug: 'megtron-4', product: 'MEGTRON 4', vendor: 'Panasonic', ids: ['megtron4'] },
  { slug: 'megtron-7', product: 'MEGTRON 7', vendor: 'Panasonic', ids: ['megtron7n'] },
  { slug: 'ro4350b', product: 'RO4350B', vendor: 'Rogers', ids: ['ro4350b'] },
  { slug: 'ro4003c', product: 'RO4003C', vendor: 'Rogers', ids: ['ro4003c'] },
  { slug: 'ro3003', product: 'RO3003', vendor: 'Rogers', ids: ['ro3003'] },
  { slug: 'rt-duroid-5880', product: 'RT/duroid 5880', vendor: 'Rogers', ids: ['rt5880'] },
  { slug: '370hr', product: '370HR', vendor: 'Isola', ids: ['370hr'] },
  { slug: 'fr408hr', product: 'FR408HR', vendor: 'Isola', ids: ['fr408hr'] },
  { slug: 'i-speed', product: 'I-Speed', vendor: 'Isola', ids: ['ispeed'] },
  { slug: 'tachyon-100g', product: 'Tachyon 100G', vendor: 'Isola', ids: ['tachyon100g'] },
  { slug: 'tu-872-slk', product: 'TU-872 SLK', vendor: 'TUC', ids: ['tu872slk'] },
  { slug: 's1141', product: 'S1141', vendor: 'Shengyi', ids: ['s1141', 's1141-2116', 's1141-1080'] },
  { slug: 's1000-2m', product: 'S1000-2M', vendor: 'Shengyi', ids: ['s1000-2m'] },
  { slug: 'np-155fr', product: 'NP-155FR', vendor: 'Nan Ya', ids: ['np155f'], range: 'Dk 4.2–4.4 and Df 0.014–0.016' },
  { slug: 'pyralux-ap', product: 'Pyralux AP', vendor: 'DuPont', ids: ['pyralux-ap'] },
  { slug: 'pyralux-hp', product: 'Pyralux HP', vendor: 'DuPont', ids: ['pyralux-hp-adh', 'pyralux-hp-coverlay'] },
  { slug: 'psr-4000', product: 'PSR-4000 solder mask', vendor: 'Taiyo', ids: ['psr4000bn', 'psr4000hfx'] },
];

export const materialPath = (slug: string) => `/pcb-materials/${slug}`;
const ALL = [...LAMINATES, ...MASKS];
export const entriesOf = (m: MaterialPageDef): Laminate[] => m.ids.map((id) => ALL.find((l) => l.id === id)).filter((l): l is Laminate => !!l);
export const isMask = (m: MaterialPageDef) => m.ids.every((id) => MASKS.some((l) => l.id === id));
export const materialPageBySlug = (slug: string) => MATERIAL_PAGES.find((m) => m.slug === slug);
export const materialPageByPath = (path: string) => (path.startsWith('/pcb-materials/') ? materialPageBySlug(path.slice('/pcb-materials/'.length)) : undefined);
/** The page that shows a library entry, for links from the material library table. */
export const materialPageOfEntry = (id: string) => MATERIAL_PAGES.find((m) => m.ids.includes(id));

/** Search title: the product name and "Dk & Df", which is how people search for laminate data. */
export const materialSeoTitle = (m: MaterialPageDef) => `${m.product} Dk & Df (${m.vendor})`;
export const materialTitle = (m: MaterialPageDef) => `${m.product} Dk and Df`;

/** A datasheet number as written: 3.0 rather than 3. */
export const dkText = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
/** "Dk 3.66 and Df 0.0037", "design Dk …" where the value is the manufacturer's design Dk, or the datasheet range. */
export function headline(m: MaterialPageDef): string {
  if (m.range) return m.range;
  const l = entriesOf(m)[0];
  return `${/design Dk/i.test(l.note) ? 'design Dk' : 'Dk'} ${dkText(l.dk)} and Df ${l.df}`;
}
/** Meta description from the headline datasheet entry, 155 characters or less. */
export function materialDescription(m: MaterialPageDef): string {
  const l = entriesOf(m)[0];
  const tg = l.tg ? `, Tg ${l.tg} °C` : '';
  const tail = m.ids.length > 1 ? ` ${m.ids.length} datasheet entries and modelled Dk and Df from 1 to 20 GHz.` : ' Modelled Dk and Df from 1 to 20 GHz.';
  return `${m.vendor} ${m.product}: ${headline(m)} at ${l.fGHz} GHz from the datasheet${tg}.${tail}`;
}
