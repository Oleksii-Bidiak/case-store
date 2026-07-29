import { hashStr } from '../ids';

/**
 * The frozen palette vocabulary for seed images (plan 170, TASK-363). Names
 * only — the stub generator ignores them; TASK-365 maps them to real colours.
 */
export type PaletteId =
  | 'indigo'
  | 'sky'
  | 'amber'
  | 'emerald'
  | 'fuchsia'
  | 'orange'
  | 'violet'
  | 'teal'
  | 'blue'
  | 'rose'
  | 'lime'
  | 'slate';

export const PALETTE_IDS: readonly PaletteId[] = [
  'indigo',
  'sky',
  'amber',
  'emerald',
  'fuchsia',
  'orange',
  'violet',
  'teal',
  'blue',
  'rose',
  'lime',
  'slate',
];

/** Deterministic palette choice — the same key always yields the same palette. */
export function pickPalette(key: string): PaletteId {
  return PALETTE_IDS[hashStr(key) % PALETTE_IDS.length];
}
