import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_REORDER_IDS, ReorderTreeDto } from './reorder.dto';

/**
 * The reorder payload bounds (plan 158 §3.4). The per-field maxima multiply out
 * (20 groups × 500 ids = 10 000), so the TOTAL-id cap is what actually bounds the work
 * done while the tree advisory lock is held.
 */
describe('ReorderTreeDto — payload bounds', () => {
  const uuid = (n: number): string => `550e8400-e29b-41d4-a716-${n.toString().padStart(12, '0')}`;

  const groupsOf = (count: number, perGroup: number): unknown =>
    Array.from({ length: count }, (_, g) => ({
      parentId: null,
      orderedIds: Array.from({ length: perGroup }, (_, i) => uuid(g * perGroup + i)),
    }));

  const errorsOf = (payload: unknown): string[] =>
    validateSync(plainToInstance(ReorderTreeDto, payload), { whitelist: true }).flatMap((e) =>
      Object.keys(e.constraints ?? {}),
    );

  it('accepts a realistic payload (2 buckets, well under the cap)', () => {
    expect(errorsOf({ groups: groupsOf(2, 5) })).toEqual([]);
  });

  it('accepts exactly MAX_REORDER_IDS ids spread across groups', () => {
    expect(errorsOf({ groups: groupsOf(10, MAX_REORDER_IDS / 10) })).toEqual([]);
  });

  it('rejects a payload whose TOTAL id count exceeds the cap, even when every field is within its own max', () => {
    // 20 groups × 100 ids = 2 000: each group is under @ArrayMaxSize(500) and the group
    // count is exactly @ArrayMaxSize(20) — only the combined cap catches this.
    const errors = errorsOf({ groups: groupsOf(20, 100) });

    expect(errors).toContain('maxTotalOrderedIds');
  });

  it('rejects more than 20 groups', () => {
    expect(errorsOf({ groups: groupsOf(21, 1) })).toContain('arrayMaxSize');
  });
});
