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
  ): SlugRedirectRow => ({ entity, scope: '', oldSlug, newScope: '', newSlug });

  /** A row between two namespaced addresses (TASK-566), written `scope:slug` on each side. */
  const scoped = (from: string, to: string, entity: SlugRedirectEntity = PAGE): SlugRedirectRow => {
    const [scope, oldSlug] = from.split(':');
    const [newScope, newSlug] = to.split(':');
    return { entity, scope, oldSlug, newScope, newSlug };
  };

  /** Order-insensitive row-set equality. */
  const expectRows = (actual: SlugRedirectRow[], expected: SlugRedirectRow[]) => {
    const key = (r: SlugRedirectRow) =>
      `${r.entity}|${r.scope}:${r.oldSlug}|${r.newScope}:${r.newSlug}`;
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

  // ── TASK-566: an address is (scope, slug). Pages live in two namespaces, so
  //    `/legal/B` and `/info/B` are different addresses of different pages. ──

  const LEGAL = (slug: string) => ({ scope: 'LEGAL', slug });
  const INFO = (slug: string) => ({ scope: 'INFO', slug });

  it('case 10: the same slug in another scope is a different address — never overwritten', () => {
    const result = applySlugRename([scoped('LEGAL:B', 'LEGAL:C')], PAGE, INFO('B'), INFO('D'));

    expectRows(result, [scoped('LEGAL:B', 'LEGAL:C'), scoped('INFO:B', 'INFO:D')]);
  });

  it('case 11: the collapse repoints only aliases of the renamed ADDRESS, not of its bare slug', () => {
    const result = applySlugRename(
      [scoped('LEGAL:A', 'LEGAL:B'), scoped('INFO:Z', 'INFO:B')],
      PAGE,
      LEGAL('B'),
      LEGAL('C'),
    );

    expectRows(result, [
      scoped('LEGAL:A', 'LEGAL:C'),
      scoped('INFO:Z', 'INFO:B'),
      scoped('LEGAL:B', 'LEGAL:C'),
    ]);
  });

  it('case 12: a kind move keeping the slug is a rename between addresses', () => {
    const result = applySlugRename([], PAGE, LEGAL('B'), INFO('B'));

    expectRows(result, [scoped('LEGAL:B', 'INFO:B')]);
  });

  it('case 13: a kind move collapses the chain onto the new address', () => {
    const result = applySlugRename([scoped('LEGAL:A', 'LEGAL:B')], PAGE, LEGAL('B'), INFO('B'));

    expectRows(result, [scoped('LEGAL:A', 'INFO:B'), scoped('LEGAL:B', 'INFO:B')]);
  });

  it('case 14: moving back leaves no self-loop and no 2-cycle', () => {
    const result = applySlugRename([scoped('LEGAL:B', 'INFO:B')], PAGE, INFO('B'), LEGAL('B'));

    expectRows(result, [scoped('INFO:B', 'LEGAL:B')]);
    for (const r of result) {
      expect(`${r.scope}:${r.oldSlug}`).not.toBe(`${r.newScope}:${r.newSlug}`);
    }
  });

  it('case 15: a bare-string rename stays in the empty scope (single-namespace entities)', () => {
    const result = applySlugRename([], CATEGORY, 'B', 'C');

    expectRows(result, [row('B', 'C', CATEGORY)]);
  });
});
