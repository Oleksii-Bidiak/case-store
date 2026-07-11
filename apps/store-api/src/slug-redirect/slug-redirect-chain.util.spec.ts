import { SlugRedirectEntity } from '@prisma/client';
import { applySlugRename, SlugRedirectRow } from './slug-redirect-chain.util';

/**
 * Exhaustive case table for the chain-collapse reducer — plan 147 §Design
 * Decision 2. Each case number below matches the plan's table row.
 */
describe('applySlugRename (chain-collapse reducer)', () => {
  const PAGE = SlugRedirectEntity.PAGE;
  const CATEGORY = SlugRedirectEntity.CATEGORY;

  const row = (
    oldSlug: string,
    newSlug: string,
    entity: SlugRedirectEntity = PAGE,
  ): SlugRedirectRow => ({ entity, oldSlug, newSlug });

  /** Order-insensitive row-set equality. */
  const expectRows = (actual: SlugRedirectRow[], expected: SlugRedirectRow[]) => {
    const key = (r: SlugRedirectRow) => `${r.entity}|${r.oldSlug}|${r.newSlug}`;
    expect([...actual].map(key).sort()).toEqual([...expected].map(key).sort());
  };

  /** Asserts no self-loop (`oldSlug === newSlug`) and no 2-cycle survives. */
  const expectNoLoops = (rows: SlugRedirectRow[]) => {
    for (const r of rows) {
      expect(r.oldSlug).not.toBe(r.newSlug);
    }
    for (const a of rows) {
      for (const b of rows) {
        if (a === b) continue;
        const isTwoCycle =
          a.entity === b.entity && a.oldSlug === b.newSlug && a.newSlug === b.oldSlug;
        expect(isTwoCycle).toBe(false);
      }
    }
  };

  it('case 1: fresh first-ever rename creates a single direct redirect', () => {
    const result = applySlugRename([], PAGE, 'B', 'C');

    expectRows(result, [row('B', 'C')]);
  });

  it('case 2: simple chain collapse — a 2-hop history repoints to the live slug', () => {
    const result = applySlugRename([row('B', 'C')], PAGE, 'C', 'D');

    expectRows(result, [row('B', 'D'), row('C', 'D')]);
  });

  it('case 3: 3-hop history — every alias still lands on the live slug', () => {
    const result = applySlugRename([row('B', 'D'), row('C', 'D')], PAGE, 'D', 'E');

    expectRows(result, [row('B', 'E'), row('C', 'E'), row('D', 'E')]);
  });

  it('case 4: rename-back (undo) leaves no 2-cycle and removes the self-loop', () => {
    const result = applySlugRename([row('B', 'C')], PAGE, 'C', 'B');

    expectRows(result, [row('C', 'B')]);
    expectNoLoops(result);
  });

  it('case 5: multi-alias undo — all historical aliases repoint, self-loop removed', () => {
    const result = applySlugRename([row('B', 'D'), row('C', 'D')], PAGE, 'D', 'B');

    expectRows(result, [row('C', 'B'), row('D', 'B')]);
    expectNoLoops(result);
  });

  it('case 6: defensive no-op — from === to on an empty table creates no self row', () => {
    const result = applySlugRename([], PAGE, 'X', 'X');

    expectRows(result, []);
  });

  it('case 7: entity isolation — same slug strings on another entity are untouched', () => {
    const pageRows = [row('B', 'C', PAGE)];
    const categoryRows = [row('B', 'C', CATEGORY)];
    const combined = [...pageRows, ...categoryRows];

    const result = applySlugRename(combined, PAGE, 'C', 'D');

    expectRows(
      result.filter((r) => r.entity === PAGE),
      [row('B', 'D', PAGE), row('C', 'D', PAGE)],
    );
    // The CATEGORY row array is completely unchanged — no cross-entity mutation.
    expect(result.filter((r) => r.entity === CATEGORY)).toEqual([row('B', 'C', CATEGORY)]);
    expect(categoryRows).toEqual([row('B', 'C', CATEGORY)]);
  });

  it('case 8: defensive no-op — from === to on a non-empty table changes nothing', () => {
    const result = applySlugRename([row('B', 'C')], PAGE, 'C', 'C');

    expectRows(result, [row('B', 'C')]);
  });

  it('case 9: fan-in collapse — multiple aliases converging on one slug all repoint', () => {
    const result = applySlugRename([row('B', 'C'), row('Z', 'C')], PAGE, 'C', 'D');

    expectRows(result, [row('B', 'D'), row('Z', 'D'), row('C', 'D')]);
  });
});
