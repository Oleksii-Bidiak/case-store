import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { SlugRedirectEntity } from '@prisma/client';
import {
  applySlugRename,
  SlugAddress,
  SlugRedirectRow,
} from '../src/slug-redirect/slug-redirect-chain.util';
import { SlugRedirectRepository } from '../src/slug-redirect/slug-redirect.repository';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for `SlugRedirectRepository.recordRename` (TASK-285-C) —
 * run the REAL repository against a REAL Postgres instance (no mocks). Only a
 * live DB proves the 3-statement write sequence (upsert → updateMany →
 * deleteMany) actually produces the states the pure reducer predicts — the
 * mismatch class of bug that bit `CategoryRepository.findDescendantIds`
 * (TASK-238) is exactly what this guards against.
 *
 * The fixtures ARE plan 147 §Design Decision 2's 9-row case table: each case
 * seeds the "existing rows", executes the rename through `recordRename` inside
 * a real transaction, reads back the final rows, and asserts they equal BOTH
 * the table's expected rows AND `applySlugRename`'s output for the same
 * inputs — so this suite and the unit reducer spec can never silently drift.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('SlugRedirectRepository.recordRename (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: SlugRedirectRepository;

  /** Per-run namespace so parallel/leftover rows never collide on the unique key. */
  const ns = `it-${randomUUID().slice(0, 8)}`;
  const slug = (s: string) => `${ns}-${s}`;

  const PAGE = SlugRedirectEntity.PAGE;
  const CATEGORY = SlugRedirectEntity.CATEGORY;

  interface Case {
    name: string;
    seed: SlugRedirectRow[];
    entity: SlugRedirectEntity;
    from: string;
    to: string;
    expected: SlugRedirectRow[];
  }

  const row = (
    oldSlug: string,
    newSlug: string,
    entity: SlugRedirectEntity = PAGE,
  ): SlugRedirectRow => ({
    entity,
    scope: '',
    oldSlug: slug(oldSlug),
    newScope: '',
    newSlug: slug(newSlug),
  });

  // Plan 147 §Design Decision 2 — the same 9-row case table as the unit spec.
  const cases: Case[] = [
    {
      name: 'case 1: fresh first-ever rename',
      seed: [],
      entity: PAGE,
      from: 'B',
      to: 'C',
      expected: [row('B', 'C')],
    },
    {
      name: 'case 2: simple chain collapse (2-hop history)',
      seed: [row('B', 'C')],
      entity: PAGE,
      from: 'C',
      to: 'D',
      expected: [row('B', 'D'), row('C', 'D')],
    },
    {
      name: 'case 3: 3-hop history',
      seed: [row('B', 'D'), row('C', 'D')],
      entity: PAGE,
      from: 'D',
      to: 'E',
      expected: [row('B', 'E'), row('C', 'E'), row('D', 'E')],
    },
    {
      name: 'case 4: rename-back (undo) — no 2-cycle, self-loop removed',
      seed: [row('B', 'C')],
      entity: PAGE,
      from: 'C',
      to: 'B',
      expected: [row('C', 'B')],
    },
    {
      name: 'case 5: multi-alias undo',
      seed: [row('B', 'D'), row('C', 'D')],
      entity: PAGE,
      from: 'D',
      to: 'B',
      expected: [row('C', 'B'), row('D', 'B')],
    },
    {
      name: 'case 6: defensive no-op (from === to, empty table)',
      seed: [],
      entity: PAGE,
      from: 'X',
      to: 'X',
      expected: [],
    },
    {
      name: 'case 7: entity isolation — same strings on another entity untouched',
      seed: [row('B', 'C', PAGE), row('B', 'C', CATEGORY)],
      entity: PAGE,
      from: 'C',
      to: 'D',
      expected: [row('B', 'D', PAGE), row('C', 'D', PAGE), row('B', 'C', CATEGORY)],
    },
    {
      name: 'case 8: defensive no-op (from === to, non-empty table)',
      seed: [row('B', 'C')],
      entity: PAGE,
      from: 'C',
      to: 'C',
      expected: [row('B', 'C')],
    },
    {
      name: 'case 9: fan-in collapse — multiple aliases converging on one slug',
      seed: [row('B', 'C'), row('Z', 'C')],
      entity: PAGE,
      from: 'C',
      to: 'D',
      expected: [row('B', 'D'), row('Z', 'D'), row('C', 'D')],
    },
  ];

  const key = (r: SlugRedirectRow) =>
    `${r.entity}|${r.scope}:${r.oldSlug}|${r.newScope}:${r.newSlug}`;

  const readBack = async (): Promise<SlugRedirectRow[]> => {
    const rows = await prisma.slugRedirect.findMany({
      where: { oldSlug: { startsWith: `${ns}-` } },
    });
    return rows.map((r) => ({
      entity: r.entity,
      scope: r.scope,
      oldSlug: r.oldSlug,
      newScope: r.newScope,
      newSlug: r.newSlug,
    }));
  };

  const cleanNamespace = () =>
    prisma.slugRedirect.deleteMany({ where: { oldSlug: { startsWith: `${ns}-` } } });

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SlugRedirectRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(SlugRedirectRepository);
  });

  afterEach(async () => {
    await cleanNamespace();
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await cleanNamespace();
    await app.close();
  });

  it.each(cases)('$name', async ({ seed, entity, from, to, expected }) => {
    if (seed.length > 0) {
      await prisma.slugRedirect.createMany({ data: seed });
    }

    await prisma.$transaction((tx) => repo.recordRename(tx, entity, slug(from), slug(to)));

    const final = await readBack();

    // The live DB must land on exactly the case table's expected final state…
    expect(final.map(key).sort()).toEqual(expected.map(key).sort());

    // …which must itself be exactly what the pure reducer predicts for the
    // same inputs (anti-drift tie between this suite and the unit spec).
    const predicted = applySlugRename(seed, entity, slug(from), slug(to));
    expect(final.map(key).sort()).toEqual(predicted.map(key).sort());
  });

  // ── TASK-566: page addresses are (kind, slug). Written `KIND:slug`. ─────────
  const addr = (a: string): SlugAddress => {
    const [scope, s] = a.split(':');
    return { scope, slug: slug(s) };
  };
  const scoped = (from: string, to: string): SlugRedirectRow => {
    const f = addr(from);
    const t = addr(to);
    return { entity: PAGE, scope: f.scope, oldSlug: f.slug, newScope: t.scope, newSlug: t.slug };
  };

  interface ScopedCase {
    name: string;
    seed: SlugRedirectRow[];
    from: string;
    to: string;
    expected: SlugRedirectRow[];
  }

  const scopedCases: ScopedCase[] = [
    {
      name: 'case 10: the same slug in another kind is never overwritten',
      seed: [scoped('LEGAL:B', 'LEGAL:C')],
      from: 'INFO:B',
      to: 'INFO:D',
      expected: [scoped('LEGAL:B', 'LEGAL:C'), scoped('INFO:B', 'INFO:D')],
    },
    {
      name: 'case 11: the collapse repoints only aliases of the renamed address',
      seed: [scoped('LEGAL:A', 'LEGAL:B'), scoped('INFO:Z', 'INFO:B')],
      from: 'LEGAL:B',
      to: 'LEGAL:C',
      expected: [
        scoped('LEGAL:A', 'LEGAL:C'),
        scoped('INFO:Z', 'INFO:B'),
        scoped('LEGAL:B', 'LEGAL:C'),
      ],
    },
    {
      name: 'case 13: a kind move collapses the chain onto the new address',
      seed: [scoped('LEGAL:A', 'LEGAL:B')],
      from: 'LEGAL:B',
      to: 'INFO:B',
      expected: [scoped('LEGAL:A', 'INFO:B'), scoped('LEGAL:B', 'INFO:B')],
    },
    {
      name: 'case 14: moving back leaves no self-loop',
      seed: [scoped('LEGAL:B', 'INFO:B')],
      from: 'INFO:B',
      to: 'LEGAL:B',
      expected: [scoped('INFO:B', 'LEGAL:B')],
    },
  ];

  it.each(scopedCases)('$name', async ({ seed, from, to, expected }) => {
    if (seed.length > 0) {
      await prisma.slugRedirect.createMany({ data: seed });
    }

    await prisma.$transaction((tx) => repo.recordRename(tx, PAGE, addr(from), addr(to)));

    const final = await readBack();
    expect(final.map(key).sort()).toEqual(expected.map(key).sort());
    const predicted = applySlugRename(seed, PAGE, addr(from), addr(to));
    expect(final.map(key).sort()).toEqual(predicted.map(key).sort());
  });

  it('findRedirect reads one namespace — /legal/<old> and /info/<old> resolve independently', async () => {
    await prisma.$transaction((tx) =>
      repo.recordRename(tx, PAGE, addr('LEGAL:old'), addr('LEGAL:new-legal')),
    );
    await prisma.$transaction((tx) =>
      repo.recordRename(tx, PAGE, addr('INFO:old'), addr('INFO:new-info')),
    );

    await expect(repo.findRedirect(PAGE, slug('old'), 'LEGAL')).resolves.toMatchObject({
      newScope: 'LEGAL',
      newSlug: slug('new-legal'),
    });
    await expect(repo.findRedirect(PAGE, slug('old'), 'INFO')).resolves.toMatchObject({
      newScope: 'INFO',
      newSlug: slug('new-info'),
    });
    // A scoped row never answers the unscoped (single-namespace) lookup.
    await expect(repo.findRedirect(PAGE, slug('old'))).resolves.toBeNull();
  });

  it('findRedirect resolves a recorded rename and misses an unknown slug', async () => {
    await prisma.$transaction((tx) => repo.recordRename(tx, PAGE, slug('old'), slug('new')));

    const hit = await repo.findRedirect(PAGE, slug('old'));
    expect(hit).not.toBeNull();
    expect(hit?.newSlug).toBe(slug('new'));

    // Same slug, different entity — entity isolation on the read path too.
    await expect(repo.findRedirect(CATEGORY, slug('old'))).resolves.toBeNull();
    await expect(repo.findRedirect(PAGE, slug('never-existed'))).resolves.toBeNull();
  });
});
