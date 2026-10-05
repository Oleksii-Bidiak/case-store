import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { RetryAfterException } from '../src/common/filters/retry-after.exception';
import { ContactRepository } from '../src/contact/contact.repository';
import { CONTACT_EMAIL_COOLDOWN_MS, ContactService } from '../src/contact/contact.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { PrismaService } from '../src/prisma';

/**
 * The per-email contact cooldown against a REAL Postgres (TASK-763, TASK-764).
 *
 * The e2e suite mocks the repository, so it proves routing and the envelope but
 * cannot prove the three things that live only in the database:
 *
 * - that `Ivan@Example.com` is refused after `ivan@example.com` wrote — the
 *   repository now matches EXACTLY (no `ILIKE`), so the guarantee rests on the
 *   address being normalised before it reaches the query;
 * - that the window is measured by the DATABASE clock, so a row stamped in the
 *   future by a skewed writer holds nobody longer than the window;
 * - that the `(email, created_at DESC)` index exists to serve the probe.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Contact cooldown on Postgres (integration)', () => {
  let prisma: PrismaService;
  let repository: ContactRepository;
  let service: ContactService;
  const created: string[] = [];

  const validDto = (email: string) => ({
    name: 'Іван Петренко',
    phone: '380671234567',
    email,
    message: 'Доброго дня! Питання по замовленню.',
  });

  /** A unique, already-normalised address per test, so parallel rows never meet. */
  const freshEmail = () => `ivan.${randomUUID().slice(0, 8)}@example.com`;

  async function seedMessage(email: string, createdAt?: Date) {
    const row = await prisma.contactMessage.create({
      data: {
        name: 'Іван',
        phone: '380671234567',
        email,
        message: 'Перше повідомлення',
        ...(createdAt && { createdAt }),
      },
    });
    created.push(row.id);
    return row;
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
        ContactRepository,
        ContactService,
        // TASK-677: the shop ping is not what this suite tests.
        {
          provide: ShopNotifier,
          useValue: { enqueueContactMessage: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(ContactRepository);
    service = moduleRef.get(ContactService);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (created.length > 0) {
      await prisma.contactMessage.deleteMany({ where: { id: { in: created } } });
    }
    await prisma?.$disconnect();
  });

  it('refuses Ivan@Example.com after ivan@example.com wrote — case does not dodge it', async () => {
    const email = freshEmail();
    await seedMessage(email);

    const mixedCase = `  ${email.replace('ivan', 'Ivan').replace('example', 'Example')} `;
    const error = await service.submit(validDto(mixedCase)).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RetryAfterException);
    expect((error as RetryAfterException).retryAfterSeconds).toBeGreaterThan(590);
    expect(await prisma.contactMessage.count({ where: { email } })).toBe(1);
  });

  it('stores the first message from an address and refuses the second', async () => {
    const email = freshEmail();

    const first = await service.submit(validDto(email));
    created.push(first.id);

    await expect(service.submit(validDto(email))).rejects.toBeInstanceOf(RetryAfterException);
    expect(await prisma.contactMessage.count({ where: { email } })).toBe(1);
  });

  it('measures the age by the database clock: nine minutes ago leaves about one', async () => {
    const email = freshEmail();
    await seedMessage(email, new Date(Date.now() - 9 * 60 * 1000));

    const ageMs = await repository.findLatestMessageAgeMsByEmail(email);
    expect(ageMs).toBeGreaterThan(9 * 60 * 1000 - 5000);
    expect(ageMs).toBeLessThan(9 * 60 * 1000 + 5000);

    const error = (await service
      .submit(validDto(email))
      .catch((caught: unknown) => caught)) as RetryAfterException;
    expect(error.retryAfterSeconds).toBeGreaterThan(50);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(65);
  });

  it('holds nobody longer than the window when the row is stamped in the future', async () => {
    const email = freshEmail();
    await seedMessage(email, new Date(Date.now() + 5 * 60 * 1000));

    const error = (await service
      .submit(validDto(email))
      .catch((caught: unknown) => caught)) as RetryAfterException;

    expect(error).toBeInstanceOf(RetryAfterException);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(CONTACT_EMAIL_COOLDOWN_MS / 1000);
  });

  it('lets the sender write again once the window has passed', async () => {
    const email = freshEmail();
    await seedMessage(email, new Date(Date.now() - CONTACT_EMAIL_COOLDOWN_MS - 1000));

    const next = await service.submit(validDto(email));
    created.push(next.id);

    expect(await prisma.contactMessage.count({ where: { email } })).toBe(2);
  });

  it('does not let a SPAM row lock the real owner of the address out (TASK-761)', async () => {
    const email = freshEmail();

    // A bot fills the trap with someone else's address…
    const bot = await service.submit({ ...validDto(email), website: 'https://spam.example' });
    created.push(bot.id);
    expect((await prisma.contactMessage.findUnique({ where: { id: bot.id } }))?.status).toBe(
      'SPAM',
    );

    // …and the person who owns it can still write straight away.
    const human = await service.submit(validDto(email));
    created.push(human.id);
    expect(await prisma.contactMessage.count({ where: { email } })).toBe(2);
  });

  it('has the (email, created_at DESC) index that serves the probe', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'contact_messages'
         AND indexname = 'contact_messages_email_created_at_idx'`;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\(email, created_at DESC\)/);
  });
});
