import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { SeededUser } from '../types';

export async function seedUsers(prisma: PrismaClient) {
  // The seed creates exactly ONE admin. Its credentials are configurable via env
  // (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD) and fall back to the dev defaults
  // below — those defaults are published in the env example file, so they are
  // public knowledge and `assertSeedAllowed()` refuses to use them outside dev.
  // The upsert is idempotent and re-asserts the ADMIN role + name on every run.
  // To grant a second admin, register the account normally and promote it:
  //   UPDATE users SET role='ADMIN' WHERE email='<email>';
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@store.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!';
  const adminPasswordHash = await argon2.hash(adminPassword);
  const customerPasswordHash = await argon2.hash('Customer123!');

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true, firstName: 'Олександр', lastName: 'Коваленко' },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: 'Олександр',
      lastName: 'Коваленко',
      role: 'ADMIN',
      isActive: true,
    },
  });

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
