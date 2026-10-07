import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { NotificationBindingRepository } from '../src/notification/notification-binding.repository';
import {
  hashBindingToken,
  NotificationBindingService,
} from '../src/notification/notification-binding.service';

/**
 * Chat bindings and their one-time tokens on a REAL Postgres (TASK-675).
 *
 * What a mocked unit test cannot see, and this one exists for:
 *
 * - the token is ONE-time under concurrency, not just in sequence. Two pollers
 *   (a rolling restart briefly runs two) can read the same `/start` and exchange
 *   it at the same instant; the guarantee is a conditional `UPDATE` racing on a
 *   row lock, and only a database that actually commits in between can show it;
 * - the partial unique indexes do what the schema says: one ACTIVE SHOP row per
 *   chat; one ACTIVE CUSTOMER row per chat and account, and per chat and guest
 *   order (TASK-1091); any number of revoked ones;
 * - `revokedAt` takes a chat out of the recipient list for good.
 *
 * Every row it creates carries an external id unique to this run, and is deleted
 * in `afterAll`; the shared TELEGRAM offset row is restored to what it was.
 */
describe('Notification bindings (integration, TASK-675)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: NotificationBindingService;

  const run = randomUUID().slice(0, 8);
  const chat = (name: string) => `int-${run}-${name}`;
  const tokens: string[] = [];
  let offsetBefore: bigint | null = null;

  const SHOP = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };

  async function issue(
    params: Partial<Parameters<NotificationBindingService['issueToken']>[0]> = {},
  ): Promise<string> {
    const { token } = await service.issueToken({ ...SHOP, ...params });
    tokens.push(token);
    return token;
  }

  async function rowsFor(externalId: string) {
    return prisma.notificationBinding.findMany({
      where: { externalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, NotificationBindingRepository, NotificationBindingService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(NotificationBindingService);

    const state = await prisma.notificationChannelState.findUnique({
      where: { channel: NotificationChannel.TELEGRAM },
    });
    offsetBefore = state?.updateOffset ?? null;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notificationBinding.deleteMany({
        where: { externalId: { startsWith: `int-${run}-` } },
      });
      await prisma.notificationBindingToken.deleteMany({
        where: { tokenHash: { in: tokens.map(hashBindingToken) } },
      });
      if (offsetBefore === null) {
        await prisma.notificationChannelState.deleteMany({
          where: { channel: NotificationChannel.TELEGRAM },
        });
      } else {
        await prisma.notificationChannelState.update({
          where: { channel: NotificationChannel.TELEGRAM },
          data: { updateOffset: offsetBefore },
        });
      }
    }
    await app?.close();
  });

  it('a token is one-time: the second /start binds nothing', async () => {
    const token = await issue();
    const id = chat('once');

    const first = await service.consumeToken(token, { id, label: 'Магазин' });
    const second = await service.consumeToken(token, { id, label: 'Магазин' });

    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toEqual({ ok: false, reason: 'invalid' });
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: NotificationChannel.TELEGRAM,
      audience: NotificationAudience.SHOP,
      label: 'Магазин',
      revokedAt: null,
    });
    const stored = await prisma.notificationBindingToken.findUnique({
      where: { tokenHash: hashBindingToken(token) },
    });
    expect(stored?.consumedAt).not.toBeNull();
  });

  it('two CONCURRENT exchanges of one token from two chats produce exactly one binding', async () => {
    const token = await issue();
    const a = chat('race-a');
    const b = chat('race-b');

    const results = await Promise.all([
      service.consumeToken(token, { id: a }),
      service.consumeToken(token, { id: b }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'invalid' }]);
    const rows = [...(await rowsFor(a)), ...(await rowsFor(b))];
    expect(rows).toHaveLength(1);
  });

  it('two CONCURRENT exchanges of one token from the same chat produce exactly one binding', async () => {
    const token = await issue();
    const id = chat('race-same');

    const results = await Promise.all([
      service.consumeToken(token, { id }),
      service.consumeToken(token, { id }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it('two different tokens racing for the same chat still leave one active row', async () => {
    const [t1, t2] = [await issue(), await issue()];
    const id = chat('race-two-tokens');

    const results = await Promise.all([
      service.consumeToken(t1, { id }),
      service.consumeToken(t2, { id }),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    const ids = results.map((r) => (r.ok ? r.binding.id : null));
    expect(ids[0]).toBe(ids[1]);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it('an expired token is refused and binds nothing', async () => {
    const token = await issue();
    await prisma.notificationBindingToken.update({
      where: { tokenHash: hashBindingToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const id = chat('expired');

    await expect(service.consumeToken(token, { id })).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it('an unknown token is refused', async () => {
    await expect(service.consumeToken('n'.repeat(43), { id: chat('unknown') })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('a CUSTOMER token with neither account nor order binds nobody', async () => {
    const token = await issue({ audience: NotificationAudience.CUSTOMER });
    const id = chat('orphan-customer');

    await expect(service.consumeToken(token, { id })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it('the same chat bound again while active keeps its one row', async () => {
    const id = chat('rebind-active');
    const first = await service.consumeToken(await issue(), { id, label: 'Перша назва' });
    const second = await service.consumeToken(await issue(), { id, label: 'Друга назва' });

    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({ ok: true, created: false });
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.binding.id).toBe(first.binding.id);
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Перша назва');
  });

  it('a revoked binding is excluded from the recipients, and the chat can be connected anew', async () => {
    const id = chat('revoke');
    const bound = await service.consumeToken(await issue(), { id });
    if (!bound.ok) throw new Error('bind failed');

    const before = await service.findActiveRecipients(SHOP.channel, SHOP.audience);
    expect(before.map((b) => b.externalId)).toContain(id);
    await expect(service.hasActiveRecipient(SHOP.channel, id)).resolves.toBe(true);

    await service.revoke(bound.binding.id, SHOP);

    const after = await service.findActiveRecipients(SHOP.channel, SHOP.audience);
    expect(after.map((b) => b.externalId)).not.toContain(id);
    await expect(service.hasActiveRecipient(SHOP.channel, id)).resolves.toBe(false);
    await expect(service.revoke(bound.binding.id, SHOP)).rejects.toThrow();

    // The partial unique index ignores the revoked row: a new active one is allowed.
    const again = await service.consumeToken(await issue(), { id });
    expect(again).toMatchObject({ ok: true, created: true });
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it('revoke is scoped: a SHOP «Відключити» cannot reach a CUSTOMER binding', async () => {
    const id = chat('scope');
    const order = await prisma.order.create({
      data: { subtotal: 100, total: 100, shippingAddress: {} },
    });
    try {
      const bound = await service.consumeToken(
        await issue({ audience: NotificationAudience.CUSTOMER, orderId: order.id }),
        { id },
      );
      if (!bound.ok) throw new Error('bind failed');
      expect(bound.binding.orderId).toBe(order.id);

      await expect(service.revoke(bound.binding.id, SHOP)).rejects.toThrow();
      await expect(service.hasActiveRecipient(SHOP.channel, id)).resolves.toBe(true);
    } finally {
      await prisma.notificationBinding.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  it('revokeByExternalId stops every audience of a gone chat', async () => {
    const id = chat('gone');
    const order = await prisma.order.create({
      data: { subtotal: 100, total: 100, shippingAddress: {} },
    });
    try {
      await service.consumeToken(await issue(), { id });
      await service.consumeToken(
        await issue({ audience: NotificationAudience.CUSTOMER, orderId: order.id }),
        { id },
      );

      await expect(service.revokeByExternalId(SHOP.channel, id)).resolves.toBe(2);
      await expect(service.hasActiveRecipient(SHOP.channel, id)).resolves.toBe(false);
    } finally {
      await prisma.notificationBinding.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  // ─── TASK-679 / TASK-1091: a customer chat follows several things ─────────
  // Owner decision 2026-10-07: one active CUSTOMER row per (chat, account) and
  // per (chat, guest order); SHOP stays one active row per chat.

  describe('customer chats (TASK-679)', () => {
    const CUSTOMER = NotificationAudience.CUSTOMER;
    let orderA: string;
    let orderB: string;
    let userId: string;
    const email = `int-${run}-customer@example.com`;

    beforeAll(async () => {
      orderA = (await prisma.order.create({ data: { subtotal: 1, total: 1, shippingAddress: {} } }))
        .id;
      orderB = (await prisma.order.create({ data: { subtotal: 2, total: 2, shippingAddress: {} } }))
        .id;
      userId = (await prisma.user.create({ data: { email, passwordHash: 'x' } })).id;
    });

    afterAll(async () => {
      await prisma.notificationBinding.deleteMany({
        where: { OR: [{ orderId: { in: [orderA, orderB] } }, { userId }] },
      });
      await prisma.notificationBindingToken.deleteMany({
        where: { OR: [{ orderId: { in: [orderA, orderB] } }, { userId }] },
      });
      await prisma.order.deleteMany({ where: { id: { in: [orderA, orderB] } } });
      await prisma.user.deleteMany({ where: { email } });
    });

    it('one chat bound to order A, order B and an account at once: three active rows, each read back as its own', async () => {
      const id = chat('customer-many');

      const a = await service.consumeToken(await issue({ audience: CUSTOMER, orderId: orderA }), {
        id,
        label: '@olena',
      });
      const b = await service.consumeToken(await issue({ audience: CUSTOMER, orderId: orderB }), {
        id,
        label: '@olena',
      });
      const u = await service.consumeToken(await issue({ audience: CUSTOMER, userId }), { id });

      expect([a, b, u].map((r) => r.ok && r.created)).toEqual([true, true, true]);
      if (!a.ok || !b.ok || !u.ok) throw new Error('unreachable');
      // Before TASK-1091 the second exchange read back order A's row.
      expect(a.binding.orderId).toBe(orderA);
      expect(b.binding.orderId).toBe(orderB);
      expect(u.binding.userId).toBe(userId);
      const rows = (await rowsFor(id)).filter((r) => r.revokedAt === null);
      expect(rows).toHaveLength(3);

      // Each owner sees its own chat; the union is ONE recipient for one chat.
      await expect(service.findActiveForCustomer({ orderId: orderB })).resolves.toEqual([
        expect.objectContaining({ id: b.binding.id }),
      ]);
      const union = await service.findActiveForCustomer({ userId, orderId: orderA });
      expect(union.map((r) => r.externalId)).toEqual([id]);
    });

    it('the same order connected again from the same chat keeps its one row', async () => {
      const id = chat('customer-again');

      const first = await service.consumeToken(
        await issue({ audience: CUSTOMER, orderId: orderA }),
        { id },
      );
      const second = await service.consumeToken(
        await issue({ audience: CUSTOMER, orderId: orderA }),
        { id },
      );

      expect(first).toMatchObject({ ok: true, created: true });
      expect(second).toMatchObject({ ok: true, created: false });
      if (!first.ok || !second.ok) throw new Error('unreachable');
      expect(second.binding.id).toBe(first.binding.id);
      expect(await rowsFor(id)).toHaveLength(1);
    });

    it('the same CUSTOMER token twice → one row', async () => {
      const id = chat('customer-token-twice');
      const token = await issue({ audience: CUSTOMER, userId });

      await expect(service.consumeToken(token, { id })).resolves.toMatchObject({ ok: true });
      await expect(service.consumeToken(token, { id })).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
      expect(await rowsFor(id)).toHaveLength(1);
    });

    it('the database itself refuses a second ACTIVE row per (chat, order) and per (chat, account)', async () => {
      const id = chat('customer-db');
      const base = { channel: NotificationChannel.TELEGRAM, audience: CUSTOMER, externalId: id };
      await prisma.notificationBinding.create({ data: { ...base, orderId: orderA } });
      await prisma.notificationBinding.create({ data: { ...base, userId } });

      await expect(
        prisma.notificationBinding.create({ data: { ...base, orderId: orderA } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.notificationBinding.create({ data: { ...base, userId } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // A revoked row does not count.
      await prisma.notificationBinding.updateMany({
        where: { externalId: id, orderId: orderA },
        data: { revokedAt: new Date() },
      });
      await expect(
        prisma.notificationBinding.create({ data: { ...base, orderId: orderA } }),
      ).resolves.toBeDefined();
    });

    it('SHOP uniqueness is unchanged: one active row per chat, beside any customer rows', async () => {
      const id = chat('shop-unchanged');
      const shop = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };
      await prisma.notificationBinding.create({ data: { ...shop, externalId: id, userId } });

      // Even «connected by» a different account, a second active SHOP row for
      // the chat would double every ping — refused.
      await expect(
        prisma.notificationBinding.create({ data: { ...shop, externalId: id } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // A CUSTOMER row for the same chat is a different thing and coexists.
      await expect(
        service.consumeToken(await issue({ audience: CUSTOMER, orderId: orderB }), { id }),
      ).resolves.toMatchObject({ ok: true, created: true });
    });

    it('revokeForCustomer reaches only the proven owner — not the other order, not the account, not SHOP', async () => {
      const id = chat('customer-revoke');
      await service.consumeToken(await issue(), { id }); // SHOP
      await service.consumeToken(await issue({ audience: CUSTOMER, orderId: orderA }), { id });
      await service.consumeToken(await issue({ audience: CUSTOMER, orderId: orderB }), { id });
      await service.consumeToken(await issue({ audience: CUSTOMER, userId }), { id });

      // Earlier tests left order A connected in other chats too; all of them go.
      const ofOrderA = await prisma.notificationBinding.count({
        where: { orderId: orderA, revokedAt: null },
      });
      expect(ofOrderA).toBeGreaterThan(1);
      await expect(service.revokeForCustomer({ orderId: orderA })).resolves.toBe(ofOrderA);

      const active = (await rowsFor(id)).filter((r) => r.revokedAt === null);
      expect(active).toHaveLength(3);
      expect(active.some((r) => r.orderId === orderA)).toBe(false);
      expect(active.some((r) => r.audience === NotificationAudience.SHOP)).toBe(true);
      const ofAccount = await service.findActiveForCustomer({ userId });
      expect(ofAccount.map((r) => r.externalId)).toContain(id);
    });
  });

  it('persists the poller offset', async () => {
    await service.saveOffset(NotificationChannel.TELEGRAM, 123456789);
    await expect(service.getOffset(NotificationChannel.TELEGRAM)).resolves.toBe(123456789);

    await service.saveOffset(NotificationChannel.TELEGRAM, 123456790);
    await expect(service.getOffset(NotificationChannel.TELEGRAM)).resolves.toBe(123456790);
  });
});
