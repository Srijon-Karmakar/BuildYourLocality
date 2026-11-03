import type { Block, FacadeId, RoofId, WindowStyle, CorniceStyle } from './catalog';

/**
 * Ready-made landmarks, built from the same shaped blocks a player can edit by hand. They are
 * stylised and scaled to fit the 200-storey limit; every block stays editable afterwards.
 * Units are 3 m grid steps on the lot (a lot cell is 2 units).
 */
export interface Landmark {
  id: string;
  label: string;
  blurb: string;
  /** Lot size in cells. */
  lot: [number, number];
  blocks: Block[];
  facade: FacadeId;
  roof: RoofId;
  windows: WindowStyle;
  tint: string;
  trim?: string;
  cornice?: CorniceStyle;
}

const tier = (u: number, w: number, base: number, floors: number, extra: Partial<Block> = {}): Block => ({ u, v: u, w, d: w, floors, ...(base ? { base } : {}), ...extra });

export const LANDMARKS: Landmark[] = [
  {
    id: 'burj',
    label: 'Burj Khalifa',
    blurb: 'Stepped, twisting glass spire',
    lot: [12, 12],
    facade: 'glass',
    roof: 'membrane',
    windows: 'ribbon',
    tint: '#b9d3e6',
    blocks: [
      tier(6, 12, 0, 60, { round: 0.45, taper: 0.82, twist: 14 }),
      tier(8, 8, 60, 50, { round: 0.6, taper: 0.78, twist: 18 }),
      tier(9, 6, 110, 40, { round: 0.8, taper: 0.74, twist: 22 }),
      tier(10, 4, 150, 30, { round: 1, taper: 0.62, twist: 26 }),
      tier(11, 2, 180, 20, { round: 1, taper: 0.5, top: 'spire', topH: 70 }),
    ],
  },
  {
    id: 'empire',
    label: 'Empire State Building',
    blurb: 'Art-deco setbacks and a mast',
    lot: [8, 8],
    facade: 'limestone',
    roof: 'concrete',
    windows: 'punched',
    tint: '#ffffff',
    trim: '#b9b4a8',
    cornice: 'classic',
    blocks: [
      { u: 0, v: 0, w: 16, d: 16, floors: 6 },
      { u: 2, v: 2, w: 12, d: 12, floors: 50, base: 6 },
      { u: 3, v: 3, w: 10, d: 10, floors: 20, base: 56 },
      { u: 4, v: 4, w: 8, d: 8, floors: 14, base: 76 },
      { u: 5, v: 5, w: 6, d: 6, floors: 6, base: 90, round: 0.3 },
      { u: 6, v: 6, w: 4, d: 4, floors: 4, base: 96, round: 0.6, taper: 0.85 },
      { u: 7, v: 7, w: 2, d: 2, floors: 2, base: 100, round: 1, top: 'spire', topH: 46 },
    ],
  },
  {
    id: 'wtc1',
    label: 'One World Trade Center',
    blurb: 'Square base turning into an octagon, tapering to a spire',
    lot: [10, 10],
    facade: 'mirror',
    roof: 'slate',
    windows: 'ribbon',
    tint: '#a9c4d6',
    blocks: [
      { u: 0, v: 0, w: 20, d: 20, floors: 4, facade: 'concrete' },
      { u: 1, v: 1, w: 18, d: 18, floors: 94, base: 4, round: 0.42, bevel: true, taper: 0.8, twist: 45 },
      { u: 8, v: 8, w: 4, d: 4, floors: 2, base: 98, round: 0.5, bevel: true, taper: 0.7, top: 'spire', topH: 100 },
    ],
  },
  {
    id: 'twin',
    label: 'Twin Towers',
    blurb: 'Two tall square towers on one plaza',
    lot: [18, 8],
    facade: 'metal',
    roof: 'gravel',
    windows: 'slit',
    tint: '#e4e8ec',
    blocks: [
      { u: 0, v: 0, w: 36, d: 16, floors: 1, facade: 'stone' },
      { u: 2, v: 3, w: 10, d: 10, floors: 110, round: 0.07, bevel: true },
      { u: 24, v: 3, w: 10, d: 10, floors: 110, round: 0.07, bevel: true },
      { u: 6, v: 7, w: 2, d: 2, floors: 4, base: 110, round: 1, top: 'spire', topH: 30 },
    ],
  },
  {
    id: 'taj',
    label: 'Taj Mahal',
    blurb: 'Marble mausoleum, onion dome, four minarets',
    lot: [14, 14],
    facade: 'marble',
    roof: 'membrane',
    windows: 'iwan',
    tint: '#ffffff',
    trim: '#d9d4c6',
    blocks: [
      { u: 4, v: 4, w: 20, d: 20, floors: 2 },
      { u: 8, v: 8, w: 12, d: 12, floors: 8, base: 2, round: 0.25, bevel: true },
      { u: 10, v: 10, w: 8, d: 8, floors: 3, base: 10, round: 1 },
      { u: 10, v: 10, w: 8, d: 8, floors: 1, base: 13, round: 1, top: 'onion', topH: 14 },
      { u: 13, v: 13, w: 2, d: 2, floors: 1, base: 20, round: 1, top: 'spire', topH: 8 },
      ...[
        [8, 8],
        [18, 8],
        [8, 18],
        [18, 18],
      ].map(([u, v]): Block => ({ u, v, w: 2, d: 2, floors: 2, base: 10, round: 1, top: 'dome', topH: 3 })),
      ...[
        [4, 4],
        [22, 4],
        [4, 22],
        [22, 22],
      ].map(([u, v]): Block => ({ u, v, w: 2, d: 2, floors: 14, base: 2, round: 1, taper: 0.8, top: 'dome', topH: 3 })),
    ],
  },
];
