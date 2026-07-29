/**
 * The frozen icon vocabulary the seed images are drawn from (plan 170, TASK-363).
 * The stub generator ignores the icon; the vocabulary exists NOW so authored
 * catalogue data can name icons before TASK-365 renders them.
 */
export type IconId =
  | 'smartphone'
  | 'headphones'
  | 'earbuds'
  | 'watch'
  | 'band'
  | 'speaker'
  | 'powerbank'
  | 'case'
  | 'shield'
  | 'cable'
  | 'adapter'
  | 'plug'
  | 'car-holder'
  | 'stand'
  | 'memory-card'
  | 'usb-drive'
  | 'package';

/**
 * category slug -> icon. A stub map covering the categories the seed creates
 * today; WT-B extends it as the catalogue grows.
 */
export const ICON_BY_CATEGORY: Record<string, IconId> = {
  cases: 'case',
  'iphone-cases': 'case',
  'samsung-cases': 'case',
  'xiaomi-cases': 'case',
  chargers: 'adapter',
  'wall-chargers': 'plug',
  'car-chargers': 'car-holder',
  'wireless-chargers': 'adapter',
  cables: 'cable',
  'lightning-cables': 'cable',
  'usb-c-cables': 'cable',
  'micro-usb-cables': 'cable',
  'screen-protectors': 'shield',
  smartphones: 'smartphone',
  iphone: 'smartphone',
};

/** Resolve an icon for a catalogue entry; unknown categories fall back to 'package'. */
export function pickIcon(categorySlug: string, entrySlug: string): IconId {
  return ICON_BY_CATEGORY[categorySlug] ?? ICON_BY_CATEGORY[entrySlug] ?? 'package';
}
