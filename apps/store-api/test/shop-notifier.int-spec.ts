import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { NotificationBindingRepository } from '../src/notification/notification-binding.repository';
import { NotificationBindingService } from '../src/notification/notification-binding.service';
import { NotificationOutboxRepository } from '../src/notification-outbox/notification-outbox.repository';
import { ShopNotifier } from '../src/notification/shop-notifier.service';

type Tx = Prisma.TransactionClient;

const ROLLBACK = new Error('rollback');

/**
 * The shop's Telegram pings on a REAL Postgres (TASK-677, plan 187).
 *
 * What a mocked unit test cannot see:
 *
 * - the recipient query really means «active SHOP chats on TELEGRAM» — a
 *   revoked SHOP binding and an active CUSTOMER binding are both left out;
 * - the rows are written through the event's transaction, so an error after the
 *   enqueue (the event failing) leaves NO row behind — constraint #2 of the plan.
 *
 * Everything happens inside transactions this spec rolls back, so the shared
 * `store_test` is left exactly as it was. Every pre-existing active binding is
 * revoked inside the transaction first — another suite's chat must not be
 * counted as a recipient here.
 */
describe('ShopNotifier (integration, TASK-677)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifier: ShopNotifier;

  const run = randomUUID().slice(0, 8);
  const chat = (name: string) => `int-shop-${run}-${name}`;

  const message = {
    messageId: `msg-${run}`,
    name: 'Олена',
    phone: '+380671234567',
    email: 'olena@example.com',
    message: 'Доброго дня! Де моє замовлення?',
  };

  async function inRolledBackTx(body: (tx: Tx) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(
        async (tx) => {
          await body(tx);
          throw ROLLBACK;
        },
        { timeout: 60_000, maxWait: 20_000 },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) {
          throw error;
        }
      });
  }

  /** Revoke every active binding (rolled back with the rest), then add this spec's chats. */
  async function seedBindings(tx: Tx): Promise<void> {
    await tx.notificationBinding.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const shop = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };
    await tx.notificationBinding.createMany({
      data: [
        { ...shop, externalId: chat('owner') },
        { ...shop, externalId: chat('group') },
        { ...shop, externalId: chat('revoked'), revokedAt: new Date() },
        {
          channel: NotificationChannel.TELEGRAM,
          audience: NotificationAudience.CUSTOMER,
          externalId: chat('customer'),
        },
      ],
    });
  }

  function rowsFor(client: Tx | PrismaService) {
    return client.notificationOutbox.findMany({
      where: { recipientAddress: { startsWith: `int-shop-${run}-` } },
      orderBy: { recipientAddress: 'asc' },
    });
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        NotificationBindingRepository,
        NotificationBindingService,
        NotificationOutboxRepository,
        ShopNotifier,
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    notifier = moduleRef.get(ShopNotifier);
  });

  afterAll(async () => {
    // Nothing should have survived the rollbacks; this is the safety net.
    if (prisma) {
      await prisma.notificationOutbox.deleteMany({
        where: { recipientAddress: { startsWith: `int-shop-${run}-` } },
      });
      await prisma.notificationBinding.deleteMany({
        where: { externalId: { startsWith: `int-shop-${run}-` } },
      });
    }
    await app?.close();
  });

  it('queues exactly one TELEGRAM row per ACTIVE SHOP chat — not the revoked one, not a customer', async () => {
    await inRolledBackTx(async (tx) => {
      await seedBindings(tx);

      await expect(notifier.enqueueContactMessage(message, tx)).resolves.toBe(2);

      const rows = await rowsFor(tx);
      expect(rows.map((row) => row.recipientAddress)).toEqual([chat('group'), chat('owner')]);
      for (const row of rows) {
        expect(row).toMatchObject({
          type: 'shop-contact-message',
          channel: NotificationChannel.TELEGRAM,
          status: 'PENDING',
          payload: expect.objectContaining({ messageId: message.messageId, name: 'Олена' }),
        });
      }
    });
  });

  it('queues nothing when no SHOP chat is active', async () => {
    await inRolledBackTx(async (tx) => {
      await seedBindings(tx);
      await tx.notificationBinding.updateMany({
        where: { externalId: { startsWith: `int-shop-${run}-` } },
        data: { revokedAt: new Date() },
      });

      await expect(notifier.enqueueContactMessage(message, tx)).resolves.toBe(0);
      expect(await rowsFor(tx)).toHaveLength(0);
    });
  });

  it('leaves no row behind when the event fails after the enqueue (rollback)', async () => {
    let queuedInside = 0;

    await inRolledBackTx(async (tx) => {
      await seedBindings(tx);
      queuedInside = await notifier.enqueueContactMessage(message, tx);
      // inRolledBackTx now throws — exactly what a failing event insert does.
    });

    expect(queuedInside).toBe(2);
    expect(await rowsFor(prisma)).toHaveLength(0);
    expect(
      await prisma.notificationBinding.count({
        where: { externalId: { startsWith: `int-shop-${run}-` } },
      }),
    ).toBe(0);
  });
});
