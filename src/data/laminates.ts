// PCB laminate, solder mask and copper foil data for the loss calculator and material library.
// Every value was read from the manufacturer's own datasheet (see LAMINATE_SOURCES). Dk/Df depend
// on the glass style and resin content; where the datasheet gives a construction table, the entry
// names the construction the value belongs to.
import type { DataSource } from './source';

export type LaminateClass = 'Standard FR-4' | 'Mid loss' | 'Low loss' | 'Very low loss' | 'Ultra-low loss' | 'RF laminate';

export interface Laminate {
  id: string;
  name: string;
  vendor: string;
  cls: LaminateClass;
  dk: number;
  df: number;
  fGHz: number; // frequency of the datasheet Dk/Df
  tg?: number; // °C (DSC unless noted)
  note: string; // construction / method the value refers to
  src: number; // index into LAMINATE_SOURCES
}

export const LAMINATE_SOURCES: DataSource[] = [
  { title: 'Shengyi S1141 technical data sheet CN-TDS-2101-03', url: 'https://www.syst.com.cn/ajax/download.aspx?name=2021/01/20210119183954576.pdf&type=&itemid=1671', note: 'Dk 4.4, Df 0.013 at 1 GHz (IPC-TM-650 2.5.5.9, 1.6 mm 8×7628); Tg 140 °C.' },
  { title: 'Shengyi S1141 line-up table CN-LU-2106-S03 (SPDR)', url: 'https://www.syst.com.cn/ajax/download.aspx?name=2021/06/20210624182306479.pdf&type=&itemid=1670', note: 'Dk/Df per prepreg glass style and resin content at 1/3/5/10 GHz.' },
  { title: 'Shengyi S1000-2M technical data sheet CN-TDS-1911-03', url: 'https://www.syst.com.cn/uploadfiles/2020/03/20200316144717651.pdf', note: 'Dk 4.6, Df 0.018 at 1 GHz (2.5.5.9, 1.6 mm 8×7628); Tg 180 °C (DSC).' },
  { title: 'Nan Ya NP-155F data sheet (rev. 2025-10-27)', url: 'https://cclqc.npc.com.tw/cclfile/pdt/Datasheet_NP-155F_1761637097200.pdf', note: 'NP-155FR: Dk 4.2–4.4, Df 0.014–0.016 at 1 GHz (2.5.5.9, 0.062" laminate); Tg 155 °C. The library uses the middle of each range.' },
  { title: 'Isola 370HR data sheet (Rev C/D, 2021)', url: 'https://isola-group.com/wp-content/uploads/data-sheets/370hr.pdf', note: 'Dk 4.04, Df 0.021 at 2 GHz (Bereskin stripline); Tg 180 °C.' },
  { title: 'Isola FR408HR data sheet (Rev E, 2021)', url: 'https://www.isola-group.com/wp-content/uploads/data-sheets/fr408hr.pdf', note: 'Dk 3.65, Df 0.0095 at 10 GHz (Bereskin); Tg 190 °C.' },
  { title: 'Isola I-Speed data sheet (Rev F, 2021)', url: 'https://www.isola-group.com/wp-content/uploads/data-sheets/i-speed.pdf', note: 'Dk 3.63, Df 0.0071 at 10 GHz (Bereskin); Tg 180 °C.' },
  { title: 'Isola Tachyon 100G data sheet (Rev H)', url: 'https://www.isola-group.com/wp-content/uploads/data-sheets/tachyon-100g-laminate-and-prepreg.pdf', note: 'Dk 3.02 (2.5.5.5), Df 0.0021 (Bereskin) at 10 GHz; Tg 215 °C.' },
  { title: 'TUC TU-872 SLK data sheet DS1801013A', url: 'https://www.tuc.com.tw/en-us/products-detail/id/2', note: 'Dk 3.8, Df 0.009 at 10 GHz, resin content 50 %; Tg 200 °C (DSC).' },
  { title: 'Panasonic MEGTRON 4 R-5725 data sheet (2020)', url: 'https://industrial.panasonic.com/content/data/EM/PDF/ipcdatasheet_R-5725.pdf', note: '3313 core, resin 57 %: Dk 3.80, Df 0.007 at 10 GHz (2.5.5.5); Tg 176 °C.' },
  { title: 'Panasonic MEGTRON 6 R-5775 data sheet (2021)', url: 'https://industrial.panasonic.com/content/data/EM/PDF/ipcdatasheet_R-5775.pdf', note: 'Resin 54 % cores (3313/2116): Dk 3.61, Df 0.004 at 10 GHz (2.5.5.5); Tg 185 °C.' },
  { title: 'Panasonic MEGTRON 6 R-5775(N) data sheet (2022)', url: 'https://industrial.panasonic.com/content/data/EM/PDF/CDS_MEGTRON6_R-5775(N)_220401.pdf', note: 'Low-Dk glass, 0.75 mm: Dk 3.34, Df 0.0037 at 13 GHz (BCDR); Tg 185 °C.' },
  { title: 'Panasonic MEGTRON 7 R-5785(N) data sheet (2024)', url: 'https://industrial.panasonic.com/content/data/EM/PDF/ipcdatasheet_R-5785(N)_new.pdf', note: 'Low-Dk glass, 0.75 mm: Dk 3.31, Df 0.0023 at 14 GHz (BCDR); Tg 200 °C.' },
  { title: 'Rogers RO4000 series data sheet (RO4003C, RO4350B), 2022', url: 'https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/data-sheets/ro4000-laminates-ro4003c-and-ro4350b---data-sheet.pdf', note: 'Design Dk 3.66 (RO4350B) / 3.55 (RO4003C) for 8–40 GHz; Df 0.0037 / 0.0027 at 10 GHz.' },
  { title: 'Rogers RO3000 series data sheet, 2024', url: 'https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/data-sheets/ro3000-laminate-data-sheet-ro3003----ro3006----ro3010----ro3035.pdf', note: 'RO3003: design Dk 3.00, Df 0.0010 at 10 GHz.' },
  { title: 'Rogers RT/duroid 5870/5880 data sheet, 2022', url: 'https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/data-sheets/rt-duroid-5870---5880-data-sheet.pdf', note: 'RT/duroid 5880: Dk 2.20, Df 0.0009 at 10 GHz.' },
  { title: 'Taiyo America PSR-4000 BN DI series TDS (Feb 2024)', url: 'https://taiyo-america.com/docs/files/4017/0795/9873/TDS_PSR-4000_BN_DI_Series_February_2024.pdf', note: 'Solder mask: Dk 3.9, Df 0.027 at 1 GHz.' },
  { title: 'Taiyo America PSR-4000 HFX DI TDS (Jun 2020)', url: 'https://taiyo-america.com/docs/files/7415/9427/3070/TDS_PSR-4000_HFX_DI_June_10_2020.pdf', note: 'Solder mask: Dk 3.5, Df 0.019 at 1 GHz.' },
  { title: 'Rogers “Copper Foils for High Frequency Circuit Materials” (Pub. 92-243, 2021)', url: 'https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/properties---detailed-characteristics/copper-foils-for-high-frequency-circuit-materials.pdf', note: 'Measured RMS roughness Sq of rolled, ED, RTF and LoPro foils.' },
  { title: 'Furukawa Electric copper foil product pages (GTS, FV-WS, FZ-WS)', url: 'https://www.furukawaelectric.com/foil/en/product/print/gts.html', note: 'Rz of standard (GTS-MP), HVLP (FV-WS) and HVLP2 (FZ-WS) foils.' },
  { title: 'Circuit Foil HFZ-B data sheet (2016)', url: 'https://www.circuitfoil.com/wp-content/uploads/2019/07/HFZ-B.pdf', note: 'RTF foil, treated side Rq ≤ 1.1 µm.' },
  { title: 'B. Simonovich, “Cannonball-Huray Model Demystified,” white paper, 2019', url: 'http://lamsimenterprises.com/WhitePaper_Cannonball-Huray%20Model%20Demystified.pdf', note: 'Rz ≈ 2√3·Rq; Huray sphere radius r ≈ 0.06·Rz with 14 spheres on a 36r² tile (surface ratio 4.89).' },
];

export const LAMINATES: Laminate[] = [
  { id: 's1141', name: 'S1141 (laminate)', vendor: 'Shengyi', cls: 'Standard FR-4', dk: 4.4, df: 0.013, fGHz: 1, tg: 140, note: '1.6 mm 8×7628 laminate, IPC-TM-650 2.5.5.9.', src: 0 },
  { id: 's1141-2116', name: 'S1141 2116 prepreg, RC 55 %', vendor: 'Shengyi', cls: 'Standard FR-4', dk: 4.0, df: 0.017, fGHz: 5, tg: 140, note: 'Line-up table, SPDR.', src: 1 },
  { id: 's1141-1080', name: 'S1141 1080 prepreg, RC 64 %', vendor: 'Shengyi', cls: 'Standard FR-4', dk: 3.73, df: 0.019, fGHz: 5, tg: 140, note: 'Line-up table, SPDR.', src: 1 },
  { id: 'np155f', name: 'NP-155FR', vendor: 'Nan Ya', cls: 'Standard FR-4', dk: 4.3, df: 0.015, fGHz: 1, tg: 155, note: 'Middle of the datasheet ranges (Dk 4.2–4.4, Df 0.014–0.016), 0.062" laminate.', src: 3 },
  { id: 's1000-2m', name: 'S1000-2M', vendor: 'Shengyi', cls: 'Standard FR-4', dk: 4.6, df: 0.018, fGHz: 1, tg: 180, note: 'High-Tg FR-4, 1.6 mm 8×7628, 2.5.5.9.', src: 2 },
  { id: '370hr', name: '370HR', vendor: 'Isola', cls: 'Standard FR-4', dk: 4.04, df: 0.021, fGHz: 2, tg: 180, note: 'High-Tg FR-4, Bereskin stripline.', src: 4 },
  { id: 'fr408hr', name: 'FR408HR', vendor: 'Isola', cls: 'Mid loss', dk: 3.65, df: 0.0095, fGHz: 10, tg: 190, note: 'Bereskin stripline.', src: 5 },
  { id: 'tu872slk', name: 'TU-872 SLK', vendor: 'TUC', cls: 'Mid loss', dk: 3.8, df: 0.009, fGHz: 10, tg: 200, note: 'Resin content 50 %.', src: 8 },
  { id: 'megtron4', name: 'MEGTRON 4 (R-5725), 3313 RC 57 %', vendor: 'Panasonic', cls: 'Low loss', dk: 3.8, df: 0.007, fGHz: 10, tg: 176, note: 'Core table, IPC-TM-650 2.5.5.5.', src: 9 },
  { id: 'ispeed', name: 'I-Speed', vendor: 'Isola', cls: 'Low loss', dk: 3.63, df: 0.0071, fGHz: 10, tg: 180, note: 'Bereskin stripline.', src: 6 },
  { id: 'megtron6', name: 'MEGTRON 6 (R-5775), RC 54 %', vendor: 'Panasonic', cls: 'Very low loss', dk: 3.61, df: 0.004, fGHz: 10, tg: 185, note: 'E-glass cores 3313/2116, 2.5.5.5.', src: 10 },
  { id: 'megtron6n', name: 'MEGTRON 6 (R-5775N), low-Dk glass', vendor: 'Panasonic', cls: 'Very low loss', dk: 3.34, df: 0.0037, fGHz: 13, tg: 185, note: '0.75 mm, BCDR.', src: 11 },
  { id: 'tachyon100g', name: 'Tachyon 100G', vendor: 'Isola', cls: 'Ultra-low loss', dk: 3.02, df: 0.0021, fGHz: 10, tg: 215, note: 'Dk 2.5.5.5, Df Bereskin stripline.', src: 7 },
  { id: 'megtron7n', name: 'MEGTRON 7 (R-5785N), low-Dk glass', vendor: 'Panasonic', cls: 'Ultra-low loss', dk: 3.31, df: 0.0023, fGHz: 14, tg: 200, note: '0.75 mm, BCDR.', src: 12 },
  { id: 'ro4350b', name: 'RO4350B', vendor: 'Rogers', cls: 'RF laminate', dk: 3.66, df: 0.0037, fGHz: 10, note: 'Design Dk (process Dk 3.48 ± 0.05); Tg > 280 °C.', src: 13 },
  { id: 'ro4003c', name: 'RO4003C', vendor: 'Rogers', cls: 'RF laminate', dk: 3.55, df: 0.0027, fGHz: 10, note: 'Design Dk (process Dk 3.38 ± 0.05); Tg > 280 °C.', src: 13 },
  { id: 'ro3003', name: 'RO3003', vendor: 'Rogers', cls: 'RF laminate', dk: 3.0, df: 0.001, fGHz: 10, note: 'Ceramic-filled PTFE, design Dk.', src: 14 },
  { id: 'rt5880', name: 'RT/duroid 5880', vendor: 'Rogers', cls: 'RF laminate', dk: 2.2, df: 0.0009, fGHz: 10, note: 'Glass-microfibre PTFE.', src: 15 },
];

export const MASKS: Laminate[] = [
  { id: 'psr4000bn', name: 'PSR-4000 BN DI', vendor: 'Taiyo', cls: 'Standard FR-4', dk: 3.9, df: 0.027, fGHz: 1, tg: 125, note: 'Liquid photoimageable solder mask.', src: 16 },
  { id: 'psr4000hfx', name: 'PSR-4000 HFX DI', vendor: 'Taiyo', cls: 'Standard FR-4', dk: 3.5, df: 0.019, fGHz: 1, note: 'Low-loss solder mask.', src: 17 },
];

export interface Foil {
  id: string;
  name: string;
  rq: number; // RMS roughness, µm
  rz: number; // ten-point height, µm
  note: string;
}

const RATIO = 2 * Math.sqrt(3); // Rz ≈ 2√3·Rq (Simonovich)
const byRq = (id: string, name: string, rq: number, note: string): Foil => ({ id, name, rq, rz: rq * RATIO, note });
const byRz = (id: string, name: string, rz: number, note: string): Foil => ({ id, name, rq: rz / RATIO, rz, note });

/** Copper foil presets, smoothest first. Rq feeds Hammerstad/Groiss; Rz sets the Huray sphere radius. */
export const FOILS: Foil[] = [
  byRq('rolled', 'Rolled annealed (Sq 0.4 µm)', 0.4, 'Rogers measurement.'),
  byRz('hvlp2', 'HVLP2 (Rz 1.0 µm)', 1.0, 'Furukawa FZ-WS, 35 µm.'),
  byRz('hvlp', 'HVLP (Rz 1.2 µm)', 1.2, 'Furukawa FV-WS, 35 µm.'),
  byRq('lopro', 'Rogers LoPro (Sq 0.9 µm)', 0.9, 'Rogers measurement.'),
  byRq('rtf', 'RTF (Rq 1.1 µm)', 1.1, 'Circuit Foil HFZ-B, treated side.'),
  byRq('ed', 'ED foil 1 oz (Sq 3.2 µm)', 3.2, 'Rogers measurement of ED foil on RO4000.'),
  byRz('std', 'Standard ED (Rz 10 µm)', 10, 'Furukawa GTS-MP, 35 µm.'),
];

/** Cannonball-Huray: 14 spheres of radius 0.06·Rz on a 36r² tile → surface ratio 14·4π/36. */
export const HURAY_SR = (14 * 4 * Math.PI) / 36;
export const hurayRadius = (rz: number) => 0.06 * rz;

export const laminateById = (id: string) => LAMINATES.find((l) => l.id === id);
export const maskById = (id: string) => MASKS.find((l) => l.id === id);
