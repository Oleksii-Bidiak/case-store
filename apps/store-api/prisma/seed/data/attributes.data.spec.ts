import { COLOR_SPEC_KEY } from '../../../src/common/color-axis';
import { cataloguePositions } from './catalogue';
import { rootCategorySlug } from './categories.data';
import {
  COLOR_DEFINITION,
  colorFacetRoots,
  colorOfPosition,
  colorOptionsByRoot,
  definitionsByRootCategory,
} from './attributes.data';

/**
 * The colour facet's declaration is checked against the CATALOGUE, in both
 * directions (TASK-487).
 *
 * Both directions matter, and for different failures:
 *
 *   - a root that declares colour but has no coloured position publishes an
 *     empty filter control — a facet a shopper can open and find nothing in;
 *   - a root that has coloured positions but does not declare colour silently
 *     loses the strongest facet in accessories, which is the state this task
 *     was opened to fix and is invisible from the outside.
 *
 * So this is not a "the list has 8 entries" assertion. It recomputes the answer
 * from `data/catalogue/**` and demands the declaration equal it.
 */
describe('colour facet declaration (TASK-487)', () => {
  /** Roots the CATALOGUE gives a colour to, recomputed from the positions. */
  const rootsWithColourData = [
    ...new Set(
      cataloguePositions()
        .filter((position) => colorOfPosition(position.variant.attributes) !== null)
        .map((position) => rootCategorySlug(position.entry.categorySlug)),
    ),
  ].sort();

  it('declares the colour facet in exactly the roots whose catalogue has colours', () => {
    expect(colorFacetRoots().sort()).toEqual(rootsWithColourData);
  });

  it('actually finds colours — the data is not empty', () => {
    // The guard against the happy vacuum: if `colorOfPosition` stopped matching
    // «Колір», both sides of the test above would be empty and it would pass.
    expect(rootsWithColourData.length).toBeGreaterThanOrEqual(6);
  });

  it('leaves the colourless roots alone', () => {
    // Cables, screen protectors and memory cards carry no colour axis at all.
    for (const root of ['cables', 'screen-protectors', 'memory-cards']) {
      expect(definitionsByRootCategory[root].map((def) => def.key)).not.toContain(COLOR_SPEC_KEY);
    }
  });

  it('declares colour FIRST, so it takes sortOrder 0 and leads the sidebar', () => {
    for (const root of colorFacetRoots()) {
      expect(definitionsByRootCategory[root][0].key).toBe(COLOR_SPEC_KEY);
    }
  });

  it('is a filterable SELECT — a TEXT definition is never offered as a facet', () => {
    expect(COLOR_DEFINITION.type).toBe('SELECT');
    expect(COLOR_DEFINITION.isFilterable).toBe(true);
  });

  describe('derived options', () => {
    const optionsByRoot = colorOptionsByRoot();

    it('produces a non-empty option list for every declaring root', () => {
      for (const root of colorFacetRoots()) {
        expect(optionsByRoot.get(root)?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('covers every colour value the catalogue actually uses', () => {
      // The SELECT dropdown in the admin spec editor is CLOSED: a value present
      // in the catalogue but missing from `options` is a value an operator can
      // see on the storefront and cannot pick in the panel.
      for (const position of cataloguePositions()) {
        const colour = colorOfPosition(position.variant.attributes);
        if (colour === null) continue;
        const root = rootCategorySlug(position.entry.categorySlug);
        expect(optionsByRoot.get(root)).toContain(colour);
      }
    });

    it('de-duplicates and sorts with the Ukrainian collator', () => {
      for (const [, options] of optionsByRoot) {
        expect(new Set(options).size).toBe(options.length);
        expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b, 'uk')));
      }
    });
  });

  describe('colorOfPosition', () => {
    it('reads the seed spelling «Колір»', () => {
      expect(colorOfPosition({ Колір: 'Чорний' })).toBe('Чорний');
    });

    it('reads the import spelling `color`', () => {
      expect(colorOfPosition({ color: 'Black' })).toBe('Black');
    });

    it('ignores non-colour axes and missing attributes', () => {
      expect(colorOfPosition({ "Пам'ять": '256 ГБ' })).toBeNull();
      expect(colorOfPosition(null)).toBeNull();
      expect(colorOfPosition(undefined)).toBeNull();
    });
  });
});
