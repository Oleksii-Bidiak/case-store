import type { PrismaClient } from '@prisma/client';
import { STORE_NAME } from '../lib/store';
import { seedSeoSettings } from './site-settings.seeder';

/**
 * `seedSeoSettings` and `siteName` on a database seeded BEFORE the field
 * existed (TASK-567).
 *
 * The singleton is upserted with `update: {}` so a re-seed never overwrites an
 * admin's edits — which also meant `siteName` landed only on a fresh row, and
 * every database seeded before wave 176 kept a blank «Назва магазину». The fix
 * fills the column when, and only when, it is still null.
 *
 * The fake keeps ONE in-memory row and honours the `where` of each write, so
 * the test asserts the resulting VALUE rather than the shape of a call.
 */
type Row = { id: string; siteName: string | null; [key: string]: unknown };

function fakePrisma(initial: Row | null) {
  let row: Row | null = initial;
  const prisma = {
    seoSettings: {
      upsert: ({
        where,
        update,
        create,
      }: {
        where: { id: string };
        update: Partial<Row>;
        create: Row;
      }) => {
        row = row && row.id === where.id ? { ...row, ...update } : { ...create };
        return Promise.resolve(row);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; siteName?: null };
        data: Partial<Row>;
      }) => {
        const matches =
          row !== null &&
          row.id === where.id &&
          (!('siteName' in where) || row.siteName === where.siteName);
        if (matches) row = { ...(row as Row), ...data };
        return Promise.resolve({ count: matches ? 1 : 0 });
      },
    },
  } as unknown as PrismaClient;
  return { prisma, current: () => row };
}

const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';

describe('seedSeoSettings — siteName (TASK-567)', () => {
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('seeds the store name on a fresh database', async () => {
    const fake = fakePrisma(null);
    await seedSeoSettings(fake.prisma);
    expect(fake.current()?.siteName).toBe(STORE_NAME);
  });

  it('fills the name on a database seeded before the field existed', async () => {
    const fake = fakePrisma({ id: SINGLETON_ID, siteName: null, noindexSite: false });
    await seedSeoSettings(fake.prisma);
    expect(fake.current()?.siteName).toBe(STORE_NAME);
  });

  it('never overwrites a name the owner set in the admin panel', async () => {
    const fake = fakePrisma({ id: SINGLETON_ID, siteName: 'Мій магазин', noindexSite: true });
    await seedSeoSettings(fake.prisma);
    expect(fake.current()?.siteName).toBe('Мій магазин');
    // …nor anything else they edited.
    expect(fake.current()?.noindexSite).toBe(true);
  });
});
