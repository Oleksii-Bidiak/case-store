import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OrderStatus, PaymentStatus, UserRole } from '@prisma/client';
import { RegistrationsRepository } from '../src/analytics/reports/registrations.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for «Реєстрації» (TASK-690, plan 188) — the real
 * `RegistrationsRepository` on a real Postgres.
 *
 * Fixtures are dated June 2024 — a year no other suite writes into (the sales
 * spec owns 2025) — and every test removes its own rows. Run serially with
 * `npm run test:int -w apps/store-api`.
 */

const NOW = new Date('2026-09-26T12:00:00Z');

function days(from: string, to: string): ReportRange {
  return resolveReportPeriod({ preset: 'custom', from, to }, NOW).current;
}

const JUNE = days('2024-06-01', '2024-06-30');
const JUNE_10 = days('2024-06-10', '2024-06-10');

describe('RegistrationsRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: RegistrationsRepository;

  const userIds: string[] = [];
  const orderIds: string[] = [];

  async function createUser(opts: {
    createdAt: string;
    email?: string;
    role?: UserRole;
    deletedAt?: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: opts.email ?? `reg-${randomUUID()}@test.local`,
        role: opts.role ?? UserRole.CUSTOMER,
        createdAt: new Date(opts.createdAt),
        ...(opts.deletedAt ? { deletedAt: new Date(opts.deletedAt) } : {}),
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createGuestOrder(email: string, createdAt: string): Promise<void> {
    const order = await prisma.order.create({
      data: {
        guestEmail: email,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: '100',
        total: '100',
        createdAt: new Date(createdAt),
      },
    });
    orderIds.push(order.id);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, RegistrationsRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(RegistrationsRepository);

    const year = { gte: new Date('2024-01-01T00:00:00Z'), lt: new Date('2025-01-01T00:00:00Z') };
    const leftovers = await prisma.user.count({ where: { createdAt: year } });
    if (leftovers > 0) {
      throw new Error(
        `The test database already holds ${leftovers} users dated 2024; clean it first`,
      );
    }
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('counts customers only — staff accounts are not registrations', async () => {
    await createUser({ createdAt: '2024-06-10T09:00:00Z' });
    await createUser({ createdAt: '2024-06-11T09:00:00Z' });
    await createUser({ createdAt: '2024-06-12T09:00:00Z', role: UserRole.MANAGER });
    await createUser({ createdAt: '2024-06-12T09:00:00Z', role: UserRole.ADMIN });

    await expect(repo.getTotals(JUNE)).resolves.toEqual({ registrations: 2, fromGuest: 0 });
  });

  it('keeps a registration that was later tombstoned — the past does not shrink', async () => {
    await createUser({ createdAt: '2024-06-10T09:00:00Z', deletedAt: '2024-07-01T09:00:00Z' });

    await expect(repo.getTotals(JUNE)).resolves.toMatchObject({ registrations: 1 });
  });

  it('counts guest → account only when the guest order came first, case-insensitively', async () => {
    await createGuestOrder('Olena@Example.test', '2024-05-20T09:00:00Z');
    await createUser({ createdAt: '2024-06-10T09:00:00Z', email: `olena@example.test` });

    // Ordered as a guest only AFTER registering (logged out): not a conversion.
    const late = `late-${randomUUID()}@test.local`;
    await createUser({ createdAt: '2024-06-10T09:00:00Z', email: late });
    await createGuestOrder(late, '2024-06-20T09:00:00Z');

    await expect(repo.getTotals(JUNE)).resolves.toEqual({ registrations: 2, fromGuest: 1 });
  });

  it('buckets by the Kyiv day, the same as the range bounds', async () => {
    // 22:30 UTC on 9 June = 01:30 on 10 June in Kyiv.
    await createUser({ createdAt: '2024-06-09T22:30:00Z' });
    // 20:59 UTC on 10 June = 23:59 on 10 June in Kyiv.
    await createUser({ createdAt: '2024-06-10T20:59:00Z' });
    // 21:00 UTC on 10 June = 00:00 on 11 June in Kyiv.
    await createUser({ createdAt: '2024-06-10T21:00:00Z' });

    await expect(repo.getTotals(JUNE_10)).resolves.toMatchObject({ registrations: 2 });

    const daily = await repo.getDaily(JUNE);
    expect(daily.find((d) => d.date === '2024-06-09')?.registrations).toBe(0);
    expect(daily.find((d) => d.date === '2024-06-10')?.registrations).toBe(2);
    expect(daily.find((d) => d.date === '2024-06-11')?.registrations).toBe(1);
  });

  it('answers an empty period with zeros and a full series, never []', async () => {
    await expect(repo.getTotals(JUNE)).resolves.toEqual({ registrations: 0, fromGuest: 0 });

    const daily = await repo.getDaily(JUNE);
    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual({ date: '2024-06-01', registrations: 0 });
    expect(daily[29]).toEqual({ date: '2024-06-30', registrations: 0 });
  });
});
