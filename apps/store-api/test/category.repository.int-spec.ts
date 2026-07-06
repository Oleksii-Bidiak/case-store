import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CategoryRepository } from '../src/category/category.repository';
import { PrismaService } from '../src/prisma';

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
      providers: [PrismaService, CategoryRepository],
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
