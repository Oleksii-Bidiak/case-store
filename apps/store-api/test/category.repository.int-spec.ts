import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CategoryRepository } from '../src/category/category.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * Integration tests for the recursive traversal helpers (`findSubtreeIds` /
 * `findAncestorIds` from TASK-236, and `findDescendantIds` — the cycle-detection
 * helper, TASK-238) — run the REAL repository against a REAL Postgres instance
 * (no mocks). Only a live DB can prove the recursive CTE is correct: that a
 * subtree query rolls up every descendant at any depth, an ancestor query walks
 * up to the root, and — crucially — that SIBLINGS never leak into either result.
 * A live DB is also the only thing that catches a wrong physical table/column
 * name in the raw SQL (the unit spec mocks `$queryRaw`) — the TASK-238 bug.
 *
 * Fixture tree (two independent roots so cross-tree leakage is caught):
 *
 *   rootA
 *     ├── childA1
 *     │     └── grandchildA1a
 *     └── childA2            (sibling of childA1)
 *   rootB                    (unrelated second tree)
 *     └── childB1
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('CategoryRepository traversal (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CategoryRepository;

  let rootA: string;
  let childA1: string;
  let childA2: string;
  let grandchildA1a: string;
  let rootB: string;
  let childB1: string;

  const MISSING_ID = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, CategoryRepository, SlugRedirectRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CategoryRepository);

    const s = randomUUID();
    const mk = async (name: string, parentId: string | null): Promise<string> => {
      const cat = await prisma.category.create({
        data: { name, slug: `${name}-${s}`, parentId },
      });
      return cat.id;
    };

    rootA = await mk('rootA', null);
    childA1 = await mk('childA1', rootA);
    childA2 = await mk('childA2', rootA);
    grandchildA1a = await mk('grandchildA1a', childA1);
    rootB = await mk('rootB', null);
    childB1 = await mk('childB1', rootB);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    // Delete leaves-first to respect the self-referential FK.
    await prisma.category.deleteMany({
      where: { id: { in: [grandchildA1a, childA1, childA2, childB1, rootA, rootB] } },
    });
    await app.close();
  });

  // ─── findSubtreeIds ─────────────────────────────────────────────────────────

  it('findSubtreeIds(root) returns self + every descendant at any depth', async () => {
    const ids = await repo.findSubtreeIds(rootA);
    expect(new Set(ids)).toEqual(new Set([rootA, childA1, childA2, grandchildA1a]));
  });

  it('findSubtreeIds(mid-level) returns that branch only, excluding siblings and the parent', async () => {
    const ids = await repo.findSubtreeIds(childA1);
    expect(new Set(ids)).toEqual(new Set([childA1, grandchildA1a]));
    // Sibling branch and ancestor must NOT leak in.
    expect(ids).not.toContain(childA2);
    expect(ids).not.toContain(rootA);
    // A whole other tree must never leak in either.
    expect(ids).not.toContain(rootB);
    expect(ids).not.toContain(childB1);
  });

  it('findSubtreeIds(leaf) returns just the leaf', async () => {
    expect(await repo.findSubtreeIds(grandchildA1a)).toEqual([grandchildA1a]);
  });

  it('findSubtreeIds(non-existent) returns [categoryId] without throwing', async () => {
    expect(await repo.findSubtreeIds(MISSING_ID)).toEqual([MISSING_ID]);
  });

  // ─── findAncestorIds ────────────────────────────────────────────────────────

  it('findAncestorIds(grandchild) returns self + the full chain up to the root', async () => {
    const ids = await repo.findAncestorIds(grandchildA1a);
    expect(new Set(ids)).toEqual(new Set([grandchildA1a, childA1, rootA]));
    // The sibling branch must NOT appear in the ancestor chain.
    expect(ids).not.toContain(childA2);
    expect(ids).not.toContain(rootB);
  });

  it('findAncestorIds(root) returns just the root', async () => {
    expect(await repo.findAncestorIds(rootA)).toEqual([rootA]);
  });

  it('findAncestorIds(non-existent) returns [categoryId] without throwing', async () => {
    expect(await repo.findAncestorIds(MISSING_ID)).toEqual([MISSING_ID]);
  });

  // ─── findDescendantIds (cycle detection, TASK-238) ───────────────────────────
  // Unlike findSubtreeIds, this excludes the node itself — it answers "which
  // categories are BELOW me", so re-parenting under one of them is a cycle.

  it('findDescendantIds(root) returns every descendant at any depth, excluding self', async () => {
    const ids = await repo.findDescendantIds(rootA);
    expect(new Set(ids)).toEqual(new Set([childA1, childA2, grandchildA1a]));
    expect(ids).not.toContain(rootA); // self must NOT be included
    // A whole other tree must never leak in.
    expect(ids).not.toContain(rootB);
    expect(ids).not.toContain(childB1);
  });

  it('findDescendantIds(mid-level) returns its branch only, excluding self, siblings and ancestor', async () => {
    const ids = await repo.findDescendantIds(childA1);
    expect(new Set(ids)).toEqual(new Set([grandchildA1a]));
    expect(ids).not.toContain(childA1); // self
    expect(ids).not.toContain(childA2); // sibling
    expect(ids).not.toContain(rootA); // ancestor
  });

  it('findDescendantIds(leaf) returns an empty array', async () => {
    expect(await repo.findDescendantIds(grandchildA1a)).toEqual([]);
  });

  it('findDescendantIds(non-existent) returns [] without throwing', async () => {
    expect(await repo.findDescendantIds(MISSING_ID)).toEqual([]);
  });
});

/**
 * The `deleted_at IS NULL` halves of the two downward CTEs (TASK-653). Under
 * invariant I2 — deletion always tombstones a whole subtree — a live node has no
 * deleted descendant, so the filter changes no result on real data. To prove the
 * filter exists at all, this fixture BREAKS I2 on purpose: a tombstone under a live
 * root, with a deleted grandchild and a LIVE orphan under it.
 *
 *   rootT
 *     ├── liveT
 *     └── tombT        (deleted)
 *           ├── tombGrandT  (deleted)
 *           └── orphanT     (LIVE — only possible if I2 were broken)
 */
describe('CategoryRepository traversal — tombstones (integration, TASK-653)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CategoryRepository;

  let rootT: string;
  let liveT: string;
  let tombT: string;
  let tombGrandT: string;
  let orphanT: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, CategoryRepository, SlugRedirectRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CategoryRepository);

    const s = randomUUID();
    const mk = async (name: string, parentId: string | null, deleted = false) => {
      const cat = await prisma.category.create({
        data: {
          name,
          slug: `${name}-${s}`,
          parentId,
          ...(deleted ? { deletedAt: new Date(), isActive: false } : {}),
        },
      });
      return cat.id;
    };

    rootT = await mk('rootT', null);
    liveT = await mk('liveT', rootT);
    tombT = await mk('tombT', rootT, true);
    tombGrandT = await mk('tombGrandT', tombT, true);
    orphanT = await mk('orphanT', tombT);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.category.deleteMany({ where: { id: { in: [tombGrandT, orphanT] } } });
    await prisma.category.deleteMany({ where: { id: { in: [tombT, liveT] } } });
    await prisma.category.deleteMany({ where: { id: rootT } });
    await app.close();
  });

  it('findSubtreeIds skips a deleted child — and everything below it', async () => {
    expect(new Set(await repo.findSubtreeIds(rootT))).toEqual(new Set([rootT, liveT]));
  });

  it('findDescendantIds skips a deleted child — and everything below it', async () => {
    expect(new Set(await repo.findDescendantIds(rootT))).toEqual(new Set([liveT]));
  });

  it('findSubtreeIds(tombstone) keeps the self id (the contract) but no deleted descendant', async () => {
    const ids = await repo.findSubtreeIds(tombT);
    expect(ids).toContain(tombT);
    expect(ids).not.toContain(tombGrandT);
  });

  it('findDescendantIds(tombstone) returns only live rows', async () => {
    expect(await repo.findDescendantIds(tombT)).toEqual([orphanT]);
  });
});

/**
 * The stored branch-visibility flag `ancestorsActive` (TASK-1032, owner decision
 * 2026-10-29: deactivation CASCADES). It is true iff every ANCESTOR of the row is
 * active and live; a category's own `isActive` never feeds its own flag, only its
 * descendants'. Every write that can change it — status toggles, a PUT, a reparent
 * (single or batch), a create, a delete with a new target — must recompute it in
 * the same transaction, and only a real Postgres shows whether the recursive
 * recompute reaches every depth without touching an unrelated tree.
 *
 *   rootV
 *     ├── midV
 *     │     └── leafV
 *     └── sideV            (no children — moved around by the reparent tests)
 *   otherV                 (unrelated root, stays active throughout)
 *     └── otherChildV
 *   offV                   (INACTIVE root — a reparent destination)
 */
describe('CategoryRepository branch visibility (integration, TASK-1032)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CategoryRepository;

  const s = randomUUID();
  let rootV: string;
  let midV: string;
  let leafV: string;
  let sideV: string;
  let otherV: string;
  let otherChildV: string;
  let offV: string;
  const created: string[] = [];

  /** `ancestorsActive` of each id, as committed. */
  async function flags(ids: string[]): Promise<Record<string, boolean>> {
    const rows = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, ancestorsActive: true },
    });
    return Object.fromEntries(rows.map((row) => [row.id, row.ancestorsActive]));
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, CategoryRepository, SlugRedirectRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CategoryRepository);

    const mk = async (name: string, parentId: string | null, isActive = true) => {
      const cat = await prisma.category.create({
        data: { name, slug: `${name}-${s}`, parentId, isActive },
      });
      created.push(cat.id);
      return cat.id;
    };

    rootV = await mk('rootV', null);
    midV = await mk('midV', rootV);
    leafV = await mk('leafV', midV);
    sideV = await mk('sideV', rootV);
    otherV = await mk('otherV', null);
    otherChildV = await mk('otherChildV', otherV);
    offV = await mk('offV', null, false);
    // Raw `prisma.category.create` bypasses the repository, so settle the flags once.
    await repo.refreshBranchVisibility();
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    // `Category.parent` is a plain FK: detach everything first, so the delete does not
    // depend on where the tests below left each row.
    await prisma.category.updateMany({ where: { id: { in: created } }, data: { parentId: null } });
    await prisma.category.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  it('starts true under active ancestors — an inactive ROOT keeps its own flag true', async () => {
    expect(await flags([rootV, midV, leafV, sideV, offV])).toEqual({
      [rootV]: true,
      [midV]: true,
      [leafV]: true,
      [sideV]: true,
      // Its own isActive is false, but it has no ancestor: the flag describes the
      // chain ABOVE a row, never the row itself.
      [offV]: true,
    });
  });

  it('setActiveMany(false) on a root hides its whole subtree at every depth, and only it', async () => {
    await repo.setActiveMany([rootV], false);

    expect(await flags([rootV, midV, leafV, sideV, otherV, otherChildV])).toEqual({
      [rootV]: true,
      [midV]: false,
      [leafV]: false,
      [sideV]: false,
      [otherV]: true,
      [otherChildV]: true,
    });

    await repo.setActiveMany([rootV], true);
    expect(await flags([midV, leafV, sideV])).toEqual({
      [midV]: true,
      [leafV]: true,
      [sideV]: true,
    });
  });

  it('a deactivated MIDDLE link hides only what is below it', async () => {
    await repo.setActiveMany([midV], false);
    expect(await flags([midV, leafV, sideV])).toEqual({
      [midV]: true,
      [leafV]: false,
      [sideV]: true,
    });

    await repo.setActiveMany([midV], true);
    expect((await flags([leafV]))[leafV]).toBe(true);
  });

  it('the PUT path (update with isActive) cascades too, and reactivation restores', async () => {
    await repo.update(rootV, { isActive: false });
    expect(await flags([midV, leafV])).toEqual({ [midV]: false, [leafV]: false });

    await repo.update(rootV, { isActive: true });
    expect(await flags([midV, leafV])).toEqual({ [midV]: true, [leafV]: true });
  });

  it('the single deactivate / activate toggles cascade too', async () => {
    await repo.deactivate(rootV);
    expect((await flags([leafV]))[leafV]).toBe(false);

    await repo.activate(rootV);
    expect((await flags([leafV]))[leafV]).toBe(true);
  });

  it('reparenting under an inactive parent hides the moved branch; moving it out shows it', async () => {
    await repo.update(midV, { parentId: offV });
    expect(await flags([midV, leafV])).toEqual({ [midV]: false, [leafV]: false });

    await repo.update(midV, { parentId: rootV });
    expect(await flags([midV, leafV])).toEqual({ [midV]: true, [leafV]: true });
  });

  it('a batch reparent (applyTreeMoves) recomputes the moved branch as well', async () => {
    await repo.applyTreeMoves([{ parentId: offV, orderedIds: [sideV] }]);
    expect((await flags([sideV]))[sideV]).toBe(false);

    await repo.applyTreeMoves([{ parentId: otherV, orderedIds: [otherChildV, sideV] }]);
    expect((await flags([sideV]))[sideV]).toBe(true);
  });

  it('a category created under a hidden branch is born hidden', async () => {
    const underOff = await repo.create({ name: 'underOff', slug: `underOff-${s}`, parentId: offV });
    created.push(underOff.id);
    expect(underOff.ancestorsActive).toBe(false);

    const underRoot = await repo.create({
      name: 'underRoot',
      slug: `underRoot-${s}`,
      parentId: rootV,
    });
    created.push(underRoot.id);
    expect(underRoot.ancestorsActive).toBe(true);
  });

  it('findBySlug (public) answers null for an active subcategory under an inactive ancestor', async () => {
    await repo.setActiveMany([rootV], false);
    try {
      expect(await repo.findBySlug(`leafV-${s}`)).toBeNull();
      // The admin read still finds it.
      expect(await repo.findBySlug(`leafV-${s}`, { activeOnly: false })).not.toBeNull();
    } finally {
      await repo.setActiveMany([rootV], true);
    }
    expect(await repo.findBySlug(`leafV-${s}`)).not.toBeNull();
  });

  it('the shipped migration backfill computes the same flags as the repository', async () => {
    await repo.setActiveMany([midV], false);
    try {
      // Corrupt the fixture flags, then run ONLY the migration's backfill statement.
      await prisma.category.updateMany({
        where: { id: { in: created } },
        data: { ancestorsActive: true },
      });
      await prisma.category.update({ where: { id: rootV }, data: { ancestorsActive: false } });
      const backfill = readFileSync(
        join(
          __dirname,
          '..',
          'prisma',
          'migrations',
          '20261029120000_category_ancestors_active',
          'migration.sql',
        ),
        'utf8',
      )
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .find((statement) => statement.startsWith('WITH RECURSIVE'));
      expect(backfill).toBeDefined();
      await prisma.$executeRawUnsafe(backfill!);

      expect(await flags([rootV, midV, leafV, otherChildV])).toEqual({
        [rootV]: true,
        [midV]: true,
        [leafV]: false,
        [otherChildV]: true,
      });
    } finally {
      await repo.setActiveMany([midV], true);
    }
  });
});
