import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { Category } from '@prisma/client';
import { CategoryRepository } from '../src/category/category.repository';
import {
  CategoryCycleError,
  CategoryMaxDepthError,
  CategoryNotFoundError,
  CategorySelfParentError,
  CategoryTreeStaleError,
} from '../src/category/category.errors';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';
import { treeLockKey } from '../src/common/reorder';

/** The very key `CategoryRepository` locks on for any parent change (plan 158 §3.8). */
const TREE_LOCK_KEY = treeLockKey('categories');

/** Reject (rather than hang) if `promise` is still pending after `ms`. */
const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${what}`)), ms);
    }),
  ]);
};

/**
 * Integration tests for the batch reorder/reparent write path (TASK-291-C, plan
 * 158 §3.6/§3.7/§3.8) — the REAL repository against a REAL Postgres (no mocks).
 *
 * Only a live DB can prove the parts this design actually rests on: the
 * transaction-scoped advisory locks, the in-transaction `findDescendantIds` CTE
 * re-check, transactional atomicity of a rejected batch, and — the headline —
 * that no interleaving of concurrent admins can commit a cycle, a duplicate
 * `sortOrder`, or a gap.
 *
 * Every payload deliberately avoids describing the ROOT bucket (`parentId: null`):
 * a described bucket must carry the COMPLETE child list, and the root bucket of a
 * shared `store_test` database also holds fixtures of other int-specs. Fixture
 * roots (`P1`, `P2`, `R`) are used as the top of every payload instead.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('CategoryRepository batch reorder (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CategoryRepository;

  /** Ids created by the current test, in creation order (parents before children). */
  let created: string[] = [];

  const MISSING_ID = '00000000-0000-0000-0000-000000000000';

  const mk = async (name: string, parentId: string | null, sortOrder = 0): Promise<string> => {
    const cat = await prisma.category.create({
      data: { name, slug: `${name}-${randomUUID()}`, parentId, sortOrder },
    });
    created.push(cat.id);
    return cat.id;
  };

  const rows = async (ids: string[]): Promise<Category[]> =>
    prisma.category.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });

  const bucket = async (parentId: string): Promise<Array<{ id: string; sortOrder: number }>> => {
    const children = await prisma.category.findMany({
      where: { parentId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    return children;
  };

  /** Assert a bucket's sortOrder set is exactly 0..n-1 — no duplicates, no gaps. */
  const expectContiguous = (children: Array<{ sortOrder: number }>): void => {
    expect(children.map((c) => c.sortOrder)).toEqual(children.map((_, i) => i));
  };

  /** Walk parent links from `id` with a visited set — throws nothing, returns true on a cycle. */
  const hasCycle = async (id: string): Promise<boolean> => {
    const seen = new Set<string>([id]);
    let current: string | null = id;
    for (;;) {
      const row: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = row?.parentId ?? null;
      if (current === null) return false;
      if (seen.has(current)) return true;
      seen.add(current);
    }
  };

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
  });

  beforeEach(() => {
    created = [];
  });

  afterEach(async () => {
    // Leaves-first (reverse creation order) to respect the self-referential FK —
    // and re-root everything first, because a test may have reparented rows.
    if (created.length === 0) return;
    await prisma.category.updateMany({
      where: { id: { in: created } },
      data: { parentId: null },
    });
    await prisma.category.deleteMany({ where: { id: { in: created } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ─── findCategoryTreeForAdmin — flat read, no structural cap (§3.3) ──────────

  describe('findCategoryTreeForAdmin', () => {
    it('returns a level-5 node the 3-nested-include read could never represent', async () => {
      const l1 = await mk('l1', null);
      const l2 = await mk('l2', l1);
      const l3 = await mk('l3', l2);
      const l4 = await mk('l4', l3);
      const l5 = await mk('l5', l4);

      const tree = await repo.findCategoryTreeForAdmin();
      const root = tree.find((n) => n.id === l1);

      expect(root).toBeDefined();
      const n2 = root!.children.find((n) => n.id === l2)!;
      const n3 = n2.children.find((n) => n.id === l3)!;
      const n4 = n3.children.find((n) => n.id === l4)!;
      const n5 = n4.children.find((n) => n.id === l5)!;

      expect(n5).toBeDefined();
      expect(n5.depth).toBe(5);
      expect(root!.depth).toBe(1);
      expect(n5.parentId).toBe(l4);
      expect(root!.parentId).toBeNull();
    });

    it('carries productCount (active products only) and is inactive-inclusive', async () => {
      const root = await mk('cnt-root', null);
      const child = await mk('cnt-child', root);
      await prisma.category.update({ where: { id: child }, data: { isActive: false } });

      const tree = await repo.findCategoryTreeForAdmin();
      const node = tree.find((n) => n.id === root)!;

      expect(node.children[0].id).toBe(child);
      expect(node.children[0].isActive).toBe(false);
      expect(node.productCount).toBe(0);
      expect(node.children[0].productCount).toBe(0);
    });

    it('orders siblings by sortOrder then id (legacy all-zero rows are deterministic)', async () => {
      const root = await mk('tie-root', null);
      const a = await mk('tie-a', root, 0);
      const b = await mk('tie-b', root, 0);
      const c = await mk('tie-c', root, 0);

      const tree = await repo.findCategoryTreeForAdmin();
      const node = tree.find((n) => n.id === root)!;

      expect(node.children.map((n) => n.id)).toEqual([a, b, c].sort());
    });
  });

  // ─── findDescendantIds — tx-widened signature (§3.7 step 3) ──────────────────

  describe('findDescendantIds(id, tx)', () => {
    it('sees the UNCOMMITTED moves of the transaction it is passed', async () => {
      const p = await mk('tx-p', null);
      const x = await mk('tx-x', p);
      const y = await mk('tx-y', null);

      await prisma.$transaction(async (tx) => {
        // Before the in-tx move, y is not a descendant of p.
        expect(await repo.findDescendantIds(p, tx)).toEqual([x]);

        await tx.category.update({ where: { id: y }, data: { parentId: x } });

        const ids = await repo.findDescendantIds(p, tx);
        expect(new Set(ids)).toEqual(new Set([x, y]));
      });

      // The committed state agrees.
      expect(new Set(await repo.findDescendantIds(p))).toEqual(new Set([x, y]));
    });
  });

  // ─── applyTreeMoves — happy paths ────────────────────────────────────────────

  describe('applyTreeMoves — reorder within a parent', () => {
    it('rewrites the bucket to the submitted order, contiguous 0..n-1', async () => {
      const root = await mk('ro-root', null);
      const a1 = await mk('ro-a1', root, 0);
      const a2 = await mk('ro-a2', root, 1);
      const a3 = await mk('ro-a3', root, 2);

      const { tree, movedIds } = await repo.applyTreeMoves([
        { parentId: root, orderedIds: [a3, a1, a2] },
      ]);

      const children = await bucket(root);
      expect(children.map((c) => c.id)).toEqual([a3, a1, a2]);
      expectContiguous(children);

      // The returned tree is the refreshed admin tree.
      const node = tree.find((n) => n.id === root)!;
      expect(node.children.map((n) => n.id)).toEqual([a3, a1, a2]);

      // A pure sibling reorder moves NOTHING between buckets (TASK-291-D §3.13).
      expect(movedIds).toEqual([]);
    });
  });

  describe('applyTreeMoves — movedIds (post-commit side-effect input, §3.13)', () => {
    it('reports exactly the nodes whose parentId actually changed', async () => {
      const root = await mk('mv-root', null);
      const a = await mk('mv-a', root, 0);
      const b = await mk('mv-b', root, 1);
      const a1 = await mk('mv-a1', a, 0);
      const a2 = await mk('mv-a2', a, 1);

      const { movedIds } = await repo.applyTreeMoves([
        { parentId: a, orderedIds: [a2] },
        { parentId: b, orderedIds: [a1] }, // a1 is the only REPARENTED node
      ]);

      expect(movedIds).toEqual([a1]);
    });
  });

  describe('applyTreeMoves — reparent across parents', () => {
    it('moves the node, densifies the source bucket and leaves no hole', async () => {
      const root = await mk('rp-root', null);
      const a = await mk('rp-a', root, 0);
      const b = await mk('rp-b', root, 1);
      const a1 = await mk('rp-a1', a, 0);
      const a2 = await mk('rp-a2', a, 1);
      const b1 = await mk('rp-b1', b, 0);

      await repo.applyTreeMoves([
        { parentId: a, orderedIds: [a2] },
        { parentId: b, orderedIds: [b1, a1] },
      ]);

      const source = await bucket(a);
      expect(source.map((c) => c.id)).toEqual([a2]);
      expectContiguous(source);

      const dest = await bucket(b);
      expect(dest.map((c) => c.id)).toEqual([b1, a1]);
      expectContiguous(dest);

      expect(await repo.findDescendantIds(b)).toContain(a1);
    });

    it('accepts an empty orderedIds — a parent may lose its last child', async () => {
      const root = await mk('mt-root', null);
      const a = await mk('mt-a', root, 0);
      const b = await mk('mt-b', root, 1);
      const a1 = await mk('mt-a1', a, 0);

      await repo.applyTreeMoves([
        { parentId: a, orderedIds: [] },
        { parentId: b, orderedIds: [a1] },
      ]);

      expect(await bucket(a)).toEqual([]);
      expect((await bucket(b)).map((c) => c.id)).toEqual([a1]);
    });

    it('re-densifies a source bucket the client did NOT describe (server-computed closure)', async () => {
      const root = await mk('cl-root', null);
      const a = await mk('cl-a', root, 0);
      const b = await mk('cl-b', root, 1);
      const a1 = await mk('cl-a1', a, 0);
      const a2 = await mk('cl-a2', a, 1);
      const a3 = await mk('cl-a3', a, 2);

      // The client omits the source bucket (a) entirely — the server must still
      // resequence it to 0..n-1 rather than leave the hole a2 left behind.
      await repo.applyTreeMoves([{ parentId: b, orderedIds: [a2] }]);

      const source = await bucket(a);
      expect(source.map((c) => c.id)).toEqual([a1, a3]);
      expectContiguous(source);
      expect((await bucket(b)).map((c) => c.id)).toEqual([a2]);
    });
  });

  describe('applyTreeMoves — idempotence', () => {
    it('replaying the same payload writes nothing and leaves updatedAt untouched', async () => {
      const root = await mk('id-root', null);
      const a1 = await mk('id-a1', root, 0);
      const a2 = await mk('id-a2', root, 1);

      await repo.applyTreeMoves([{ parentId: root, orderedIds: [a2, a1] }]);
      const before = await rows([root, a1, a2]);

      // The FIRST call must actually have written the requested order — without this the
      // test would pass green against a no-op `applyTreeMoves` (both snapshots identical).
      const firstPass = await bucket(root);
      expect(firstPass.map((c) => c.id)).toEqual([a2, a1]);
      expectContiguous(firstPass);

      await repo.applyTreeMoves([{ parentId: root, orderedIds: [a2, a1] }]);
      const after = await rows([root, a1, a2]);

      expect(after).toEqual(before);
    });
  });

  // ─── applyTreeMoves — rejections ─────────────────────────────────────────────

  describe('applyTreeMoves — atomicity', () => {
    it('a payload whose LAST group names a non-existent parent leaves every row byte-identical', async () => {
      const root = await mk('at-root', null);
      const a1 = await mk('at-a1', root, 0);
      const a2 = await mk('at-a2', root, 1);

      const before = await rows([root, a1, a2]);

      await expect(
        repo.applyTreeMoves([
          { parentId: root, orderedIds: [a2, a1] }, // legal, would have been written
          { parentId: MISSING_ID, orderedIds: [] }, // unknown parent → whole batch dies
        ]),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);

      expect(await rows([root, a1, a2])).toEqual(before);
    });
  });

  describe('applyTreeMoves — cycle on a real graph', () => {
    it('rejects moving a node under its own descendant', async () => {
      const root = await mk('cy-root', null);
      const a = await mk('cy-a', root, 0);
      const a1 = await mk('cy-a1', a, 0);

      await expect(repo.applyTreeMoves([{ parentId: a1, orderedIds: [a] }])).rejects.toBeInstanceOf(
        CategoryCycleError,
      );

      const fresh = await prisma.category.findUnique({ where: { id: a } });
      expect(fresh!.parentId).toBe(root);
    });
  });

  describe('applyTreeMoves — depth (level + height − 1 ≤ 4)', () => {
    it('accepts a 2-level subtree dropped under a LEVEL-2 node (its leaves land on level 4)', async () => {
      const l1 = await mk('dp-l1', null); // level 1
      const l2 = await mk('dp-l2', l1); // level 2
      const sub = await mk('dp-sub', l1, 1); // height 2 (sub + its child)
      const subChild = await mk('dp-sub-child', sub);

      // sub → level 3, height 2 ⇒ 3 + 2 − 1 = 4 ≤ 4 — level 4 IS legal.
      await repo.applyTreeMoves([
        { parentId: l1, orderedIds: [l2] },
        { parentId: l2, orderedIds: [sub] },
      ]);

      const moved = await prisma.category.findUnique({ where: { id: sub } });
      expect(moved!.parentId).toBe(l2);
      const child = await prisma.category.findUnique({ where: { id: subChild } });
      expect(child!.parentId).toBe(sub);
    });

    it('rejects the same subtree dropped under a LEVEL-3 node (would reach level 5)', async () => {
      const l1 = await mk('dq-l1', null);
      const l2 = await mk('dq-l2', l1);
      const l3 = await mk('dq-l3', l2); // level 3
      const sub = await mk('dq-sub', l1, 1);
      await mk('dq-sub-child', sub);

      // sub → level 4, height 2 ⇒ 4 + 2 − 1 = 5 > 4.
      await expect(
        repo.applyTreeMoves([
          { parentId: l1, orderedIds: [l2] },
          { parentId: l3, orderedIds: [sub] },
        ]),
      ).rejects.toBeInstanceOf(CategoryMaxDepthError);

      const fresh = await prisma.category.findUnique({ where: { id: sub } });
      expect(fresh!.parentId).toBe(l1);
    });
  });

  describe('applyTreeMoves — staleness (§3.7)', () => {
    it('409s a described bucket whose MEMBERSHIP changed underneath the client', async () => {
      const root = await mk('st-root', null);
      const a = await mk('st-a', root, 0);
      const b = await mk('st-b', root, 1);
      const a1 = await mk('st-a1', a, 0);
      const a2 = await mk('st-a2', a, 1);
      const b1 = await mk('st-b1', b, 0);

      // A stale client still believes bucket `a` holds exactly [a1, a2] …
      const stalePayload = [{ parentId: a, orderedIds: [a2, a1] }];

      // … while another admin reparents b1 INTO it. The stale payload does not name
      // b1, so bucket `a`'s post-batch member SET ({a1, a2, b1}) no longer equals the
      // described set — a lost update, surfaced as CATEGORY_TREE_STALE rather than
      // silently dropping b1's slot.
      await repo.applyTreeMoves([
        { parentId: b, orderedIds: [] },
        { parentId: a, orderedIds: [a1, a2, b1] },
      ]);

      await expect(repo.applyTreeMoves(stalePayload)).rejects.toBeInstanceOf(
        CategoryTreeStaleError,
      );
    });

    it('is NOT stale when a described bucket keeps the same member set (pure reorder, §3.7)', async () => {
      const root = await mk('sn-root', null);
      const a = await mk('sn-a', root, 0);
      const a1 = await mk('sn-a1', a, 0);
      const a2 = await mk('sn-a2', a, 1);

      await repo.applyTreeMoves([{ parentId: a, orderedIds: [a2, a1] }]);
      // A second client that loaded the PRE-reorder view submits the other ordering:
      // same members ⇒ last-writer-wins, never a 409.
      await expect(
        repo.applyTreeMoves([{ parentId: a, orderedIds: [a1, a2] }]),
      ).resolves.toBeDefined();

      expect((await bucket(a)).map((c) => c.id)).toEqual([a1, a2]);
    });
  });

  // ─── applyTreeMoves — concurrency (the load-bearing cases, §3.8) ─────────────

  describe('applyTreeMoves — concurrent collision on the same bucket', () => {
    it('two conflicting pure reorders serialise: final order = exactly ONE submitted ordering, 0..n-1, no 409', async () => {
      const root = await mk('cc-root', null);
      const a1 = await mk('cc-a1', root, 0);
      const a2 = await mk('cc-a2', root, 1);
      const a3 = await mk('cc-a3', root, 2);

      const orderX = [a3, a2, a1];
      const orderY = [a2, a1, a3];

      const results = await Promise.allSettled([
        repo.applyTreeMoves([{ parentId: root, orderedIds: orderX }]),
        repo.applyTreeMoves([{ parentId: root, orderedIds: orderY }]),
      ]);

      // Equal member sets → never stale → both must succeed (last-writer-wins).
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

      const children = await bucket(root);
      expectContiguous(children);
      const finalOrder = children.map((c) => c.id);
      expect([orderX, orderY]).toContainEqual(finalOrder);
    });
  });

  describe('applyTreeMoves — concurrent INVERSE reparents (tree-scoped lock, §3.8)', () => {
    it('exactly one succeeds, the other is a cycle, and NO cycle is committed', async () => {
      // Disjoint bucket sets by construction: payload1 touches {p1, y}, payload2
      // touches {p2, x}. Per-bucket locks would let BOTH commit → x → y → x.
      const p1 = await mk('iv-p1', null);
      const p2 = await mk('iv-p2', null);
      const x = await mk('iv-x', p1);
      const y = await mk('iv-y', p2);

      const results = await Promise.allSettled([
        repo.applyTreeMoves([
          { parentId: p1, orderedIds: [] },
          { parentId: y, orderedIds: [x] },
        ]),
        repo.applyTreeMoves([
          { parentId: p2, orderedIds: [] },
          { parentId: x, orderedIds: [y] },
        ]),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(CategoryCycleError);

      // The committed table contains NO cycle.
      expect(await hasCycle(x)).toBe(false);
      expect(await hasCycle(y)).toBe(false);
    });
  });

  describe('applyTreeMoves — concurrent reparent + reorder of an overlapping bucket', () => {
    it('serialises: never writer-A parentId with writer-B slot, buckets stay 0..n-1', async () => {
      const root = await mk('ov-root', null);
      const a = await mk('ov-a', root, 0);
      const b = await mk('ov-b', root, 1);
      const a1 = await mk('ov-a1', a, 0);
      const a2 = await mk('ov-a2', a, 1);
      const a3 = await mk('ov-a3', a, 2);

      const results = await Promise.allSettled([
        // reparent a1 out of bucket `a`
        repo.applyTreeMoves([
          { parentId: a, orderedIds: [a2, a3] },
          { parentId: b, orderedIds: [a1] },
        ]),
        // pure reorder of the same bucket `a`, from a pre-reparent view
        repo.applyTreeMoves([{ parentId: a, orderedIds: [a3, a2, a1] }]),
      ]);

      // Whatever the interleaving, any rejection must be the staleness conflict.
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(CategoryTreeStaleError);
      }

      expectContiguous(await bucket(a));
      expectContiguous(await bucket(b));
      expect(await hasCycle(a1)).toBe(false);

      // a1 lives in exactly one bucket, never half-moved.
      const fresh = await prisma.category.findUnique({ where: { id: a1 } });
      expect([a, b]).toContain(fresh!.parentId);
    });
  });

  describe('update() parent change + applyTreeMoves concurrently', () => {
    it('serialises on the same locks: no cycle, buckets stay 0..n-1', async () => {
      const root = await mk('up-root', null);
      const a = await mk('up-a', root, 0);
      const b = await mk('up-b', root, 1);
      const a1 = await mk('up-a1', a, 0);
      const a2 = await mk('up-a2', a, 1);
      const b1 = await mk('up-b1', b, 0);

      const results = await Promise.allSettled([
        repo.update(a1, { parentId: b }),
        repo.applyTreeMoves([{ parentId: a, orderedIds: [a2, a1] }]),
      ]);

      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(CategoryTreeStaleError);
      }

      expectContiguous(await bucket(a));
      expectContiguous(await bucket(b));
      expect(await hasCycle(a1)).toBe(false);
      expect(await hasCycle(b1)).toBe(false);
    });
  });

  // ─── create() / update() alignment (§3.10) ──────────────────────────────────

  describe('create — appends to the end of its sibling bucket', () => {
    it('gives the first child 0 and every later sibling max + 1', async () => {
      const root = await mk('cr-root', null);

      const first = await repo.create({
        name: `cr-first-${randomUUID()}`,
        slug: `cr-first-${randomUUID()}`,
        parentId: root,
      });
      created.push(first.id);
      const second = await repo.create({
        name: `cr-second-${randomUUID()}`,
        slug: `cr-second-${randomUUID()}`,
        parentId: root,
      });
      created.push(second.id);
      const third = await repo.create({
        name: `cr-third-${randomUUID()}`,
        slug: `cr-third-${randomUUID()}`,
        parentId: root,
      });
      created.push(third.id);

      expect(first.sortOrder).toBe(0);
      expect(second.sortOrder).toBe(1);
      expect(third.sortOrder).toBe(2);
      expectContiguous(await bucket(root));
    });

    it('appends after a bucket whose max sortOrder is not n-1', async () => {
      const root = await mk('cs-root', null);
      await mk('cs-existing', root, 7);

      const appended = await repo.create({
        name: `cs-new-${randomUUID()}`,
        slug: `cs-new-${randomUUID()}`,
        parentId: root,
      });
      created.push(appended.id);

      expect(appended.sortOrder).toBe(8);
    });
  });

  describe('update — parent change appends to the destination and densifies the source', () => {
    it('assigns max(destination) + 1 and re-sequences the source bucket to 0..n-1', async () => {
      const root = await mk('ud-root', null);
      const a = await mk('ud-a', root, 0);
      const b = await mk('ud-b', root, 1);
      const a1 = await mk('ud-a1', a, 0);
      const a2 = await mk('ud-a2', a, 1);
      const a3 = await mk('ud-a3', a, 2);
      const b1 = await mk('ud-b1', b, 0);

      const { category: moved, reparented } = await repo.update(a2, { parentId: b });

      expect(reparented).toBe(true);
      expect(moved.parentId).toBe(b);
      expect(moved.sortOrder).toBe(1); // max(b) = 0 → 1

      const source = await bucket(a);
      expect(source.map((c) => c.id)).toEqual([a1, a3]);
      expectContiguous(source);

      const dest = await bucket(b);
      expect(dest.map((c) => c.id)).toEqual([b1, a2]);
      expectContiguous(dest);
    });

    // Plan §3.10.4 scopes the whole-tree lock to an ACTUAL parent change. A full-object
    // PUT re-sends the unchanged current parent on every rename; if that took the tree
    // lock, ordinary renames would serialise against every drag-and-drop in the tree.
    it('does NOT take the tree lock when parentId is present but unchanged', async () => {
      const root = await mk('nl-root', null);
      const a = await mk('nl-a', root, 0);
      const b = await mk('nl-b', root, 1);

      // Hold the tree lock in another transaction for the duration of the call.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${TREE_LOCK_KEY}::text, 0))`;
          await held;
        },
        { timeout: 20_000, maxWait: 10_000 },
      );

      try {
        const result = await withTimeout(
          repo.update(a, { name: 'nl-a-renamed', parentId: root }),
          3_000,
          'update(parentId unchanged) blocked on the tree lock',
        );

        expect(result.reparented).toBe(false);
        expect(result.category.name).toBe('nl-a-renamed');
        expect(result.category.parentId).toBe(root);
        // The sibling bucket was not resequenced by a phantom "move".
        expect((await bucket(root)).map((c) => c.id)).toEqual([a, b]);
      } finally {
        release();
        await holder;
      }
    });

    it('rejects a self-parent (parentId === id) — the hole PUT /:id has today', async () => {
      const a = await mk('us-a', null);

      await expect(repo.update(a, { parentId: a })).rejects.toBeInstanceOf(CategorySelfParentError);
    });

    it('rejects a parent change that would exceed the depth cap', async () => {
      const l1 = await mk('ux-l1', null);
      const l2 = await mk('ux-l2', l1);
      const l3 = await mk('ux-l3', l2);
      const l4 = await mk('ux-l4', l3);
      const sub = await mk('ux-sub', l1, 1);
      await mk('ux-sub-child', sub);

      await expect(repo.update(sub, { parentId: l4 })).rejects.toBeInstanceOf(
        CategoryMaxDepthError,
      );
    });

    it('rejects a parent change into its own descendant (cycle)', async () => {
      const a = await mk('uc-a', null);
      const a1 = await mk('uc-a1', a);

      await expect(repo.update(a, { parentId: a1 })).rejects.toBeInstanceOf(CategoryCycleError);
    });

    it('still records the slug redirect when a rename and a parent change land together', async () => {
      const root = await mk('ur-root', null);
      const b = await mk('ur-b', null);
      const child = await mk('ur-child', root);
      const before = await prisma.category.findUnique({ where: { id: child } });

      const newSlug = `ur-child-renamed-${randomUUID()}`;
      const { category: updated, reparented } = await repo.update(
        child,
        { parentId: b, slug: newSlug },
        { oldSlug: before!.slug, newSlug },
      );

      expect(reparented).toBe(true);
      expect(updated.parentId).toBe(b);
      expect(updated.slug).toBe(newSlug);

      const redirect = await prisma.slugRedirect.findFirst({
        where: { oldSlug: before!.slug },
      });
      expect(redirect).not.toBeNull();
      expect(redirect!.newSlug).toBe(newSlug);
      if (redirect) await prisma.slugRedirect.delete({ where: { id: redirect.id } });
    });
  });
});
