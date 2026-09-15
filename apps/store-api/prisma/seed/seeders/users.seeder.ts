import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { SeededUser } from '../types';

/**
 * Upsert the seed admin AND make it the shop's owner.
 *
 * Extracted from `seedUsers` for one reason: the write can legitimately fail, and
 * the bare failure is unreadable. `users_single_owner_key` is a PARTIAL unique
 * index (`WHERE is_owner`), so if ownership has moved to somebody else — which is
 * a normal, documented act, and the very thing manual check AD-STAFF-13 asks the
 * owner to perform on the stand — re-seeding tries to create a second owner and
 * Prisma answers `P2002` naming an index that did not exist before plan 181. This
 * being the FIRST seeder, the whole seed dies there and nothing else runs, so the
 * operator sees a wall of Prisma internals and no way forward.
 *
 * Failing is still the right behaviour: silently clearing somebody else's flag
 * would make a seed script decide who runs the shop. What is added here is only
 * the sentence that turns it into a two-minute fix. Mirrored in
 * `docs/seed-guide.md`.
 */
async function upsertSeedOwner(prisma: PrismaClient, email: string, passwordHash: string) {
  const fields = {
    role: 'ADMIN',
    isActive: true,
    isOwner: true,
    firstName: 'Олександр',
    lastName: 'Коваленко',
  } as const;

  try {
    return await prisma.user.upsert({
      where: { email },
      update: fields,
      create: { email, passwordHash, ...fields },
    });
  } catch (error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== 'P2002') {
      throw error;
    }

    const owner = await prisma.user.findFirst({
      where: { isOwner: true },
      select: { email: true },
    });

    throw new Error(
      `Ownership of the shop is currently held by ${owner?.email ?? 'another account'}, ` +
        `not by the seed admin (${email}). The seed will not take it away — that is what ` +
        'POST /api/admin/staff/:id/transfer-ownership is for. Either transfer ownership back ' +
        'to the seed admin, or reset the database (docs/seed-guide.md §5).',
    );
  }
}

export async function seedUsers(prisma: PrismaClient) {
  // The seed creates exactly ONE admin. Its credentials are configurable via env
  // (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD) and fall back to the dev defaults
  // below — those defaults are published in the env example file, so they are
  // public knowledge and `assertSeedAllowed()` refuses to use them outside dev.
  // The upsert is idempotent and re-asserts the ADMIN role + name on every run.
  // To grant a second admin, register the account normally and promote it:
  //   UPDATE users SET role='ADMIN' WHERE email='<email>';
  //
  // `isOwner` is set on BOTH halves of the upsert (TASK-474). The shop has
  // exactly one owner, and owner-only actions — transferring ownership, making
  // or unmaking an admin, touching another admin's account — are reachable by
  // nobody else. Set it only on `create` and the first re-seed of an existing
  // stand leaves a shop with no owner at all, which is not a visible failure:
  // everything else keeps working until somebody needs one of those actions.
  // On a stand where ownership has legitimately moved elsewhere this refuses
  // rather than taking it back — see `upsertSeedOwner` for why, and for the
  // message it raises instead of a bare P2002.
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@store.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!';
  const adminPasswordHash = await argon2.hash(adminPassword);
  const customerPasswordHash = await argon2.hash('Customer123!');

  const admin = await upsertSeedOwner(prisma, adminEmail, adminPasswordHash);

  // ── Customers ── customer@store.com is the long-standing demo login (kept as
  // John Doe for backwards-compat with existing fixtures); the rest carry UA
  // names + UA phones and back the seeded orders / addresses.
  //
  // Phones are written in the CANONICAL `380XXXXXXXXX` form (TASK-466), not as
  // `+380 99 123 4567`. The seed writes through Prisma and so bypasses the DTOs
  // that normalise, which means a masked literal here would quietly undo the
  // backfill migration on every `db:seed` and take the admin order search with
  // it. The exception is `site-settings.seeder.ts`, where the phone is a display
  // string for the footer, not a number anything matches on.
  const customersData: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  }[] = [
    { email: 'customer@store.com', firstName: 'John', lastName: 'Doe', phone: '380991234567' },
    {
      email: 'oksana@example.com',
      firstName: 'Оксана',
      lastName: 'Шевченко',
      phone: '380671112233',
    },
    {
      email: 'taras@example.com',
      firstName: 'Тарас',
      lastName: 'Бондаренко',
      phone: '380672223344',
    },
    { email: 'mariia@example.com', firstName: 'Марія', lastName: 'Коваль', phone: '380673334455' },
    {
      email: 'dmytro@example.com',
      firstName: 'Дмитро',
      lastName: 'Ткаченко',
      phone: '380674445566',
    },
    {
      email: 'nataliia@example.com',
      firstName: 'Наталія',
      lastName: 'Кравченко',
      phone: '380675556677',
    },
  ];

  const customers: SeededUser[] = [];
  for (const c of customersData) {
    const record = await prisma.user.upsert({
      where: { email: c.email },
      update: { firstName: c.firstName, lastName: c.lastName, phone: c.phone },
      create: {
        email: c.email,
        passwordHash: customerPasswordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    customers.push({ id: record.id, email: record.email });
  }

  // customers[0] is the demo John Doe account (owns the fixed seed-address-1).
  const customer = customers[0];

  console.log(`  ✓ Users: 1 admin (${admin.email}), ${customers.length} customers`);
  return { admin, admins: [admin], customer, customers };
}
