import { isUUID } from 'class-validator';
import { deterministicUuid, hashStr } from './ids';

/**
 * TASK-397. `deterministicUuid` feeds ProductGroup.id in the seed, and those ids
 * travel out through the admin product form and back into `@IsUUID`. Before this
 * spec the function emitted a UUID-*shaped* sha1 slice whose version and variant
 * nibbles were whatever the digest happened to hold, so most seeded groups made
 * every "save product" answer 400.
 *
 * The spec lives under `prisma/` rather than `src/`, which is why the jest config
 * in `apps/store-api/package.json` carries an explicit `roots` — with the bare
 * `rootDir: "src"` this file would never have been collected at all.
 */
describe('deterministicUuid (seed lib)', () => {
  const seeds = ['x', 'group:iphone-15-case', 'group:Чохол MagSafe', '', 'a'.repeat(500)];

  it('returns a valid v4 UUID for every seed', () => {
    for (const seed of seeds) {
      const id = deterministicUuid(seed);
      expect(isUUID(id, '4')).toBe(true);
    }
  });

  it("pins the version nibble to '4' and the variant nibble to 8/9/a/b", () => {
    // 100 seeds is far past the 1-in-16 odds that made the old implementation
    // look fine in a spot check.
    for (let i = 0; i < 100; i++) {
      const id = deterministicUuid(`group-${i}`);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('is deterministic — the same seed yields the same id', () => {
    for (const seed of seeds) {
      expect(deterministicUuid(seed)).toBe(deterministicUuid(seed));
    }
  });

  it('keeps distinct seeds distinct', () => {
    const ids = new Set(seeds.map((seed) => deterministicUuid(seed)));
    expect(ids.size).toBe(seeds.length);
  });
});

describe('hashStr (seed lib)', () => {
  it('is deterministic and non-negative', () => {
    expect(hashStr('Чохол MagSafe')).toBe(hashStr('Чохол MagSafe'));
    expect(hashStr('Чохол MagSafe')).toBeGreaterThanOrEqual(0);
  });
});
