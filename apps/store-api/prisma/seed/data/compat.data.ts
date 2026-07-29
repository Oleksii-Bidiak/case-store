/**
 * Product ↔ DeviceModel compatibility (TASK-190), as authored pairs of
 * **catalogue entry slug → device model slugs**.
 *
 * `entrySlug` is the entry's own literal slug from `data/catalogue/**`, and the
 * seeder expands it to that entry's exact position slugs. Two earlier shapes
 * were both wrong:
 *
 * 1. `slugify('Silicone Case for iPhone 15')` — the plan was keyed on English
 *    product names run through `slugify()`. TASK-366 replaced the assortment
 *    with Ukrainian names, so every key stopped matching and the seeder reported
 *    «0 links» without failing. Silent zero is the worst outcome: the storefront
 *    compat picker simply looks empty.
 * 2. Matching positions by slug **prefix**. `glass-9h-iphone-15` is a strict
 *    prefix of `glass-9h-iphone-15-pro`, so the iPhone 15 glass would have
 *    claimed the 15 Pro's positions too — a wrong «fits your device» answer,
 *    which is worse than no answer at all.
 *
 * Device slugs are what `seedDevices` produces: `slugify(name)` with `+`
 * expanded to ` plus ` (so `Galaxy S24+` → `galaxy-s24-plus`). Both sides are
 * validated against reality by the seeder, loudly.
 */
export const compatPlan: { entrySlug: string; deviceSlugs: string[] }[] = [
  // ── Чохли ─────────────────────────────────────────────────────────────────
  {
    entrySlug: 'case-spigen-liquid-air-iphone-15',
    deviceSlugs: ['iphone-15', 'iphone-15-plus'],
  },
  {
    entrySlug: 'case-silicone-magsafe-iphone-15',
    deviceSlugs: ['iphone-15', 'iphone-15-plus'],
  },
  {
    entrySlug: 'case-nillkin-nature-iphone-15-pro',
    deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
  },
  {
    entrySlug: 'case-spigen-tough-armor-iphone-15-pro',
    deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
  },
  {
    entrySlug: 'case-book-leather-iphone-14',
    deviceSlugs: ['iphone-14', 'iphone-14-plus'],
  },
  {
    entrySlug: 'case-spigen-ultra-hybrid-galaxy-s24',
    deviceSlugs: ['galaxy-s24', 'galaxy-s24-plus'],
  },
  {
    entrySlug: 'case-silicone-galaxy-s24',
    deviceSlugs: ['galaxy-s24', 'galaxy-s24-plus'],
  },
  { entrySlug: 'case-hoco-armor-galaxy-a55', deviceSlugs: ['galaxy-a55'] },
  {
    entrySlug: 'case-baseus-clear-galaxy-s23',
    deviceSlugs: ['galaxy-s23', 'galaxy-s23-ultra'],
  },
  {
    entrySlug: 'case-nillkin-frosted-redmi-note-13-pro',
    deviceSlugs: ['redmi-note-13-pro'],
  },
  {
    entrySlug: 'case-silicone-xiaomi-14',
    deviceSlugs: ['xiaomi-14', 'xiaomi-14-ultra'],
  },
  {
    entrySlug: 'case-borofone-shockproof-redmi-note-13',
    deviceSlugs: ['redmi-note-13'],
  },

  // ── Захисне скло та плівки ────────────────────────────────────────────────
  { entrySlug: 'glass-9h-iphone-15', deviceSlugs: ['iphone-15', 'iphone-15-plus'] },
  {
    entrySlug: 'glass-9h-iphone-15-pro',
    deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
  },
  { entrySlug: 'glass-9h-galaxy-s24', deviceSlugs: ['galaxy-s24'] },
  { entrySlug: 'glass-9h-redmi-note-13-pro', deviceSlugs: ['redmi-note-13-pro'] },
  { entrySlug: 'hydrogel-iphone-15-pro-max', deviceSlugs: ['iphone-15-pro-max'] },
  { entrySlug: 'hydrogel-galaxy-s24-ultra', deviceSlugs: ['galaxy-s24-ultra'] },
  {
    entrySlug: 'camera-glass-iphone-15-pro',
    deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
  },
  { entrySlug: 'camera-glass-galaxy-s24', deviceSlugs: ['galaxy-s24'] },

  // ── Зарядні пристрої ──────────────────────────────────────────────────────
  {
    entrySlug: 'wireless-charger-belkin-magsafe',
    deviceSlugs: ['iphone-16', 'iphone-16-pro', 'iphone-15', 'iphone-15-pro', 'iphone-14'],
  },
  {
    entrySlug: 'wireless-charger-baseus-3in1',
    deviceSlugs: ['iphone-15', 'iphone-15-pro', 'apple-watch-series-10-42mm'],
  },
  {
    entrySlug: 'charger-anker-20w',
    deviceSlugs: ['iphone-15', 'iphone-15-pro', 'iphone-14', 'iphone-13'],
  },
  {
    entrySlug: 'charger-baseus-gan-65w',
    deviceSlugs: ['iphone-16-pro', 'galaxy-s24', 'xiaomi-14'],
  },
  {
    entrySlug: 'car-charger-baseus-30w',
    deviceSlugs: ['iphone-15', 'galaxy-s24', 'redmi-note-13-pro'],
  },

  // ── Кабелі ────────────────────────────────────────────────────────────────
  {
    entrySlug: 'cable-anker-usbc-lightning',
    deviceSlugs: ['iphone-14', 'iphone-13', 'iphone-12'],
  },
  { entrySlug: 'cable-hoco-lightning-usba', deviceSlugs: ['iphone-14', 'iphone-13'] },
  {
    entrySlug: 'cable-ugreen-usbc-100w',
    deviceSlugs: ['iphone-16-pro', 'iphone-15-pro', 'galaxy-s24', 'xiaomi-14'],
  },

  // ── Ремінці ───────────────────────────────────────────────────────────────
  {
    entrySlug: 'band-silicone-apple-watch',
    deviceSlugs: ['apple-watch-series-10-42mm', 'apple-watch-series-10-46mm'],
  },
  {
    entrySlug: 'band-nylon-apple-watch',
    deviceSlugs: [
      'apple-watch-series-10-42mm',
      'apple-watch-series-10-46mm',
      'apple-watch-ultra-2-49mm',
    ],
  },
];
