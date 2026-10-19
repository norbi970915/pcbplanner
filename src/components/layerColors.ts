import type { LayerKind } from '../lib/stackups';

export const LAYER_COLOR: Record<LayerKind, string> = { mask: 'var(--mask)', copper: 'var(--copper)', dielectric: 'var(--laminate)', coverlay: '#c9a227', adhesive: '#886d39' };
// label colour on each layer bar, at 4.5:1 or more against LAYER_COLOR in both themes
export const LAYER_INK: Record<LayerKind, string> = { mask: '#fff', copper: '#1a1206', dielectric: 'var(--laminate-ink)', coverlay: '#1a1206', adhesive: '#fff' };
