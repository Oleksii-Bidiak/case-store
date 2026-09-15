import { cataloguePositions } from './catalogue';
import { rootCategorySlug } from './categories.data';
import {
  AXIS_BACKED_SPECS,
  colorOfPosition,
  definitionsByRootCategory,
  type AttributeDefinitionSeed,
} from './attributes.data';

/**
 * The FACET SET the catalogue ships with (TASK-488, owner decision B-10).
 *
 * TASK-487 proved the colour declaration against the catalogue in both
 * directions; this file does the same job for the rest of the facets, and for
 * the three rules B-10 fixed:
 *
 *   - a facet is a `SELECT` or a `BOOLEAN`, NEVER a `TEXT` and never a `NUMBER`
 *     — free text yields one filter value per product;
 *   - a facet nobody can reach is not a facet: the sidebar caps at six
 *     (`SpecFacets.MAX_FACETS`), so declaring a seventh silently hides it;
 *   - a facet with no values renders as a control a shopper opens and finds
 *     empty, so every filterable definition must be FILLED IN by the catalogue.
 *
 * All three are checked by RECOMPUTING from `data/catalogue/**`, not by
 * restating a list: a future data change that breaks one of them fails here
 * instead of shipping.
 */

/** The storefront's `SpecFacets.MAX_FACETS` — kept in step by this test. */
const MAX_FACETS = 6;

const facetsOf = (defs: AttributeDefinitionSeed[]): AttributeDefinitionSeed[] =>
  defs.filter((def) => def.isFilterable === true);

/**
 * Every spec KEY the catalogue actually fills in for a root, counting the two
 * bridges that write values the entry itself does not carry: the variant axes
 * of {@link AXIS_BACKED_SPECS} and colour (`colorOfPosition`, TASK-487).
 */
function filledKeysByRoot(): Map<string, Set<string>> {
  const byRoot = new Map<string, Set<string>>();
  for (const position of cataloguePositions()) {
    const root = rootCategorySlug(position.entry.categorySlug);
    const bucket = byRoot.get(root) ?? new Set<string>();

    for (const key of Object.keys(position.entry.specs ?? {})) {
      bucket.add(key);
    }
    for (const { axis, key } of AXIS_BACKED_SPECS) {
      if (position.variant.attributes?.[axis]) bucket.add(key);
    }
    if (colorOfPosition(position.variant.attributes) !== null) bucket.add('color');

    byRoot.set(root, bucket);
  }
  return byRoot;
}

describe('the catalogue facet set (TASK-488 / B-10)', () => {
  const roots = Object.entries(definitionsByRootCategory);

  describe('TEXT is never a facet', () => {
    it('declares every facet as a SELECT or a BOOLEAN', () => {
      for (const [root, defs] of roots) {
        for (const def of facetsOf(defs)) {
          expect({ root, key: def.key, type: def.type }).toEqual({
            root,
            key: def.key,
            type: expect.stringMatching(/^(SELECT|BOOLEAN)$/),
          });
        }
      }
    });

    it('keeps the free-text specs unflagged — «Захист», «Екран», «Особливості»', () => {
      // The examples B-10 names. Each is a sentence per product; as a facet it
      // would offer one value per item and filter nothing.
      const textSpecs = [
        ['cases', 'protection'],
        ['smartphones', 'screen'],
        ['screen-protectors', 'protector-features'],
        ['power-banks', 'ports'],
      ] as const;
      for (const [root, key] of textSpecs) {
        const def = definitionsByRootCategory[root].find((d) => d.key === key);
        expect(def).toBeDefined();
        expect(def?.type).toBe('TEXT');
        expect(def?.isFilterable ?? false).toBe(false);
      }
    });

    it('retyped the two promoted specs instead of just ticking the box', () => {
      // «Твердість» was TEXT («9H, товщина 0.33 мм») and «Кількість портів» was
      // NUMBER. B-10 asked for both as facets, which is only legal as SELECTs.
      const hardness = definitionsByRootCategory['screen-protectors'].find(
        (d) => d.key === 'hardness',
      );
      const ports = definitionsByRootCategory['chargers'].find((d) => d.key === 'ports');
      expect(hardness).toMatchObject({ type: 'SELECT', isFilterable: true });
      expect(ports).toMatchObject({ type: 'SELECT', isFilterable: true });
    });
  });

  describe('every facet is usable', () => {
    it('gives every SELECT facet a non-empty option list', () => {
      for (const [root, defs] of roots) {
        for (const def of facetsOf(defs)) {
          if (def.type !== 'SELECT') continue;
          // Colour derives its options from the catalogue itself (TASK-487).
          if (def.optionsFromColorAxis) continue;
          expect(`${root}.${def.key}: ${(def.options ?? []).length}`).not.toMatch(/: 0$/);
        }
      }
    });

    it('fills in every facet it declares — no empty controls', () => {
      // The failure this catches: declaring «Мікрофон» and forgetting to give
      // any headphone one. `getFilterableSpecs` would drop it server-side, so
      // the only visible symptom is a filter the owner asked for and cannot
      // find in the sidebar.
      const filled = filledKeysByRoot();
      for (const [root, defs] of roots) {
        for (const def of facetsOf(defs)) {
          expect(`${root}.${def.key}`).toBe(
            filled.get(root)?.has(def.key)
              ? `${root}.${def.key}`
              : `${root}.${def.key} (NO VALUES)`,
          );
        }
      }
    });

    it('covers every SELECT facet value the catalogue uses with an option', () => {
      // The admin spec editor renders a SELECT as a CLOSED dropdown: a value on
      // a product but missing from `options` cannot be re-picked in the panel.
      for (const position of cataloguePositions()) {
        const root = rootCategorySlug(position.entry.categorySlug);
        for (const [key, raw] of Object.entries(position.entry.specs ?? {})) {
          const def = definitionsByRootCategory[root].find((d) => d.key === key);
          if (def?.type !== 'SELECT' || def.optionsFromColorAxis) continue;
          expect(def.options).toContain(String(raw));
        }
      }
    });
  });

  describe('the sidebar ceiling', () => {
    it('declares at most six facets per root, so none is unreachable', () => {
      for (const [root, defs] of roots) {
        expect(`${root}: ${facetsOf(defs).length}`).toBe(
          `${root}: ${Math.min(facetsOf(defs).length, MAX_FACETS)}`,
        );
      }
    });

    it('reaches the ceiling exactly once — «Зарядки»', () => {
      // Recorded on purpose: chargers are the root where a seventh facet would
      // start costing something, so the next person adding one sees it here.
      const atCeiling = roots
        .filter(([, defs]) => facetsOf(defs).length === MAX_FACETS)
        .map(([root]) => root);
      expect(atCeiling).toEqual(['chargers']);
    });
  });

  describe('the per-category facet list of the B-10 market table', () => {
    // The acceptance criterion of TASK-488, spelled out: in each of the seven
    // categories of the table, these are the facets a shopper is offered, in
    // the order they are offered (declaration order = `sortOrder`, which an
    // operator may then re-order in the admin panel).
    const EXPECTED: Record<string, string[]> = {
      cases: ['color', 'material', 'case-type', 'magsafe', 'bundle'],
      'screen-protectors': ['protector-type', 'coverage', 'hardness'],
      chargers: ['color', 'charger-power', 'charger-type', 'ports', 'technology', 'charger-output'],
      cables: ['connector-out', 'cable-length'],
      headphones: ['color', 'headphone-type', 'connection', 'anc', 'microphone'],
      'power-banks': ['color', 'capacity', 'output-power'],
      holders: ['color', 'mount', 'fixation'],
      // The four roots outside the table, so this stays a complete picture.
      smartphones: ['color', 'memory', 'os'],
      smartwatches: ['color', 'case-size', 'water-protection'],
      speakers: ['color', 'power', 'water-protection'],
      'memory-cards': ['capacity', 'speed-class'],
    };

    it.each(Object.entries(EXPECTED))('%s', (root, expected) => {
      expect(facetsOf(definitionsByRootCategory[root]).map((def) => def.key)).toEqual(expected);
    });

    it('covers every declared root', () => {
      expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(definitionsByRootCategory).sort());
    });
  });

  describe('the three facets B-10 added outright', () => {
    it.each([
      ['chargers', 'charger-output'],
      ['headphones', 'microphone'],
      ['cases', 'bundle'],
    ])('%s declares %s and the catalogue fills it', (root, key) => {
      const def = definitionsByRootCategory[root].find((d) => d.key === key);
      expect(def).toMatchObject({ type: 'SELECT', isFilterable: true });
      expect(filledKeysByRoot().get(root)?.has(key)).toBe(true);
    });
  });
});
