import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { UpdateProductDto } from './update-product.dto';

/**
 * TASK-397. Saving any grouped product answered 400: the admin form reads
 * groupId / categoryId / brandId off the product it fetched and posts them back
 * unchanged, and the DTO pinned `@IsUUID(4)`.
 *
 * Dropping the pin is not enough on its own — class-validator's default `'all'`
 * still requires a version nibble in `[1-8]` and a variant nibble in `[89ab]`
 * (node_modules/validator/lib/isUUID.js), and the ids sitting in the database were
 * written by a `deterministicUuid` that set neither. This spec pins the two facts
 * that matter: ids of the shape the old seed produced are accepted, and strings
 * that are not UUID-shaped at all are still rejected.
 *
 * It runs without a database on purpose — the e2e case in
 * `test/product.e2e-spec.ts` covers the same boundary over HTTP.
 */

/**
 * The seed's `deterministicUuid` BEFORE this task: a sha1 digest cut into the
 * 8-4-4-4-12 shape, version and variant nibbles left to the digest. Reproduced
 * here (rather than imported) precisely because the real one no longer behaves
 * this way — these are the ids already stored in store_dev, and the DTO has to
 * keep accepting them.
 */
const legacySeedId = (seed: string): string => {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

const legacyIds = Array.from({ length: 200 }, (_, i) => legacySeedId(`group-${i}`));

const errorsFor = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateProductDto, payload, { enableImplicitConversion: true }));

describe('UpdateProductDto — ids the database issued (TASK-397)', () => {
  it("the legacy seed ids are mostly rejected by validator's 'all' — which is why 'loose' is pinned", () => {
    const passingAll = legacyIds.filter((id) => isUUID(id, 'all'));
    const passingLoose = legacyIds.filter((id) => isUUID(id, 'loose'));

    // Roughly one in sixteen digests happens to land a version nibble in [1-8]
    // AND a variant in [89ab]; the rest are UUID-shaped without being a UUID of
    // any version. If this ever reads 200, the seed data changed — not the bug.
    expect(passingAll.length).toBeLessThan(legacyIds.length / 2);
    expect(passingLoose).toHaveLength(legacyIds.length);
  });

  it('accepts every legacy seed id as groupId', async () => {
    for (const groupId of legacyIds) {
      const errors = await errorsFor({ groupId });
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts a groupId whose version nibble is outside [1-8]', async () => {
    const errors = await errorsFor({ groupId: 'aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a lower stock sent together with a legacy groupId (the operator edit)', async () => {
    const errors = await errorsFor({ stock: 3, groupId: legacyIds[0] });
    expect(errors).toHaveLength(0);
  });

  it('accepts legacy ids as categoryId and brandId too', async () => {
    const errors = await errorsFor({ categoryId: legacyIds[1], brandId: legacyIds[2] });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['not a uuid at all', 'not-a-uuid'],
    ['a uuid missing a group', 'aaaaaaaa-bbbb-cccc-eeeeeeeeeeee'],
    ['a uuid with a non-hex character', 'zaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee'],
    ['a bare number', '12345'],
    ['an empty string', ''],
  ])('still rejects %s', async (_label, groupId) => {
    const errors = await errorsFor({ groupId });
    expect(errors.some((e) => e.property === 'groupId')).toBe(true);
  });
});
