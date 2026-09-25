import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MAX_SPEC_FACETS } from './product-list-query.dto';

/**
 * TASK-709 — the facet ceiling is ONE number, and this bridge keeps it one.
 *
 * `MAX_SPEC_FACETS` (owner decision B-10, «стеля 6 фасетів») used to have two
 * copies tied to it only by prose in a comment: the storefront's
 * `SpecFacets.MAX_FACETS` and the seed spec's `MAX_FACETS`. The same class of
 * duplication already shipped a defect once (`COLOR_AXIS_KEYS`, TASK-364).
 * TASK-707 removed the storefront copy (the API caps, the component no longer
 * re-cuts) and made the seed spec alias the API constant — this spec fails the
 * moment either file grows a copy again that disagrees with the API.
 *
 * The storefront is a different workspace with no import path to the API, so
 * its source is read from disk (the pattern of
 * `auth/oauth/sanitize-redirect-target.spec.ts`). A moved or renamed file
 * fails `readFileSync` loudly rather than passing vacuously.
 */

const apps = resolve(__dirname, '../../../..');

const STOREFRONT_FACETS = 'store-client/src/features/product-filters/ui/spec-facets.tsx';
const SEED_FACETS_SPEC = 'store-api/prisma/seed/data/facets.data.spec.ts';

/**
 * The storefront's «Ще фільтри» disclosure count — how many facets show before
 * the rest fold away. It is NOT a ceiling, so it is the one facet constant
 * allowed to differ from `MAX_SPEC_FACETS` (it must be smaller, see below).
 */
const DISCLOSURE_CONSTANT = 'INITIAL_FACETS';

/** Source with comments removed, so a number quoted in prose never counts. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function read(relative: string): string {
  return code(readFileSync(resolve(apps, relative), 'utf8'));
}

interface FacetConstant {
  name: string;
  /** The right-hand side exactly as written, trimmed. */
  rhs: string;
}

/** Every `const <…FACET…> = …` declaration, in source order. */
function facetConstants(source: string): FacetConstant[] {
  const pattern =
    /\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*FACETS?[A-Z0-9_]*)\s*(?::\s*number\s*)?=\s*([^;\n]+)/g;
  return [...source.matchAll(pattern)].map(([, name, rhs]) => ({ name, rhs: rhs.trim() }));
}

/**
 * The number a declaration resolves to, or `undefined` when it cannot be
 * resolved statically — which the callers treat as a failure, never a pass.
 * `MAX_SPEC_FACETS` resolves only where it is really imported from the API's
 * query DTO, so a local re-declaration under the same name is not trusted.
 */
function resolveValue(rhs: string, source: string): number | undefined {
  if (/^\d+$/.test(rhs)) return Number(rhs);
  if (rhs === 'MAX_SPEC_FACETS' && importsApiCeiling(source)) return MAX_SPEC_FACETS;
  return undefined;
}

function importsApiCeiling(source: string): boolean {
  return /import\s*\{[^}]*\bMAX_SPEC_FACETS\b[^}]*\}\s*from\s*['"][^'"]*product\/dto(?:\/product-list-query\.dto)?['"]/.test(
    source,
  );
}

/** Every second argument of a `.slice(0, …)` — the ways a list gets cut. */
function sliceLimits(source: string): string[] {
  return [...source.matchAll(/\.slice\(\s*0\s*,\s*([^)]+?)\s*\)/g)].map(([, arg]) => arg);
}

describe('MAX_SPEC_FACETS parity (TASK-709)', () => {
  describe('the bridge itself — proves the parser would catch a disagreeing copy', () => {
    it('reads a literal copy and its value', () => {
      const [only] = facetConstants('const MAX_FACETS = 5;\n');
      expect(only).toEqual({ name: 'MAX_FACETS', rhs: '5' });
      expect(resolveValue(only.rhs, '')).toBe(5);
    });

    it('ignores a number that only appears in a comment', () => {
      expect(
        facetConstants(code('/* const MAX_FACETS = 5; */\n// const MAX_FACETS = 5;\n')),
      ).toEqual([]);
    });

    it('trusts MAX_SPEC_FACETS only when it is imported from the api query dto', () => {
      const imported =
        "import { MAX_SPEC_FACETS } from '../../../src/product/dto/product-list-query.dto';\nconst MAX_FACETS = MAX_SPEC_FACETS;\n";
      expect(resolveValue('MAX_SPEC_FACETS', imported)).toBe(MAX_SPEC_FACETS);
      expect(resolveValue('MAX_SPEC_FACETS', 'const MAX_SPEC_FACETS = 9;\n')).toBeUndefined();
    });

    it('finds the limit of every .slice(0, …) cut', () => {
      expect(sliceLimits('a.slice(0, INITIAL_FACETS); b.slice( 0 , 5 )')).toEqual([
        'INITIAL_FACETS',
        '5',
      ]);
    });
  });

  describe(`storefront ${STOREFRONT_FACETS}`, () => {
    const source = read(STOREFRONT_FACETS);
    const constants = facetConstants(source);

    it('declares no facet ceiling of its own that differs from MAX_SPEC_FACETS', () => {
      const ceilings = constants.filter(({ name }) => name !== DISCLOSURE_CONSTANT);
      for (const { name, rhs } of ceilings) {
        expect({ name, value: resolveValue(rhs, source) }).toEqual({
          name,
          value: MAX_SPEC_FACETS,
        });
      }
    });

    it('cuts the facet list only by a declared facet constant, never a bare number', () => {
      const declared = new Set(constants.map(({ name }) => name));
      const limits = sliceLimits(source);
      // Non-vacuous: the disclosure cut is the one this file is known to make.
      expect(limits.length).toBeGreaterThan(0);
      for (const limit of limits) {
        expect({ limit, declared: declared.has(limit) }).toEqual({ limit, declared: true });
      }
    });

    it('folds facets behind «Ще фільтри» before the ceiling, or the disclosure never shows', () => {
      const disclosure = constants.find(({ name }) => name === DISCLOSURE_CONSTANT);
      expect(disclosure).toBeDefined();
      const value = resolveValue(disclosure!.rhs, source);
      expect(value).toBeDefined();
      expect(value!).toBeGreaterThan(0);
      expect(value!).toBeLessThan(MAX_SPEC_FACETS);
    });
  });

  describe(`seed ${SEED_FACETS_SPEC}`, () => {
    const source = read(SEED_FACETS_SPEC);

    it('checks the seeded facet set against the same ceiling as the API', () => {
      const ceilings = facetConstants(source).filter(({ name }) => name === 'MAX_FACETS');
      // Non-vacuous: the seed spec names its ceiling MAX_FACETS; if that ever
      // changes, update this bridge rather than let it pass on nothing.
      expect(ceilings).toHaveLength(1);
      expect(resolveValue(ceilings[0].rhs, source)).toBe(MAX_SPEC_FACETS);
    });
  });
});
