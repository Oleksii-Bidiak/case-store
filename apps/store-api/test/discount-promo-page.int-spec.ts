import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscountType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DiscountRepository } from '../src/discount/discount.repository';
import { DiscountService } from '../src/discount/discount.service';
import { PrismaService } from '../src/prisma';

/**
 * TASK-731 (рішення B-11): «Показувати на сторінці «Акції»».
 *
 * The public feed `GET /discounts/active` is filtered on `showOnPromoPage` in
 * the REPOSITORY, so the proof has to be a real query: an e2e with a mocked
 * repository would only prove that the mock returned what it was told to.
 * An unpublished code must be absent from the feed and still apply by code.
 *
 * Requires an isolated `*_test` database (forced by setup-int.ts).
 */
describe('Discount promo-page publishing (integration — real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: DiscountService;

  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const publishedCode = `PUB${suffix}`;
  const hiddenCode = `PRIV${suffix}`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        DiscountRepository,
        {
          provide: DiscountService,
          useFactory: (repo: DiscountRepository) => new DiscountService(repo, null as never),
          inject: [DiscountRepository],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DiscountService);

    // Created through the service, as the admin form does: one published, one
    // left at the default (private).
    await service.create({
      code: publishedCode,
      type: DiscountType.PERCENT,
      value: 10,
      showOnPromoPage: true,
    });
    await service.create({ code: hiddenCode, type: DiscountType.PERCENT, value: 10 });
  });

  afterAll(async () => {
    await prisma.discount.deleteMany({ where: { code: { in: [publishedCode, hiddenCode] } } });
    await app.close();
  });

  it('stores a code created without the flag as private', async () => {
    const hidden = await prisma.discount.findUniqueOrThrow({ where: { code: hiddenCode } });
    expect(hidden.showOnPromoPage).toBe(false);
  });

  it('lists only the published code in the public feed', async () => {
    const codes = (await service.findActivePublic()).data.map((d) => d.code);

    expect(codes).toContain(publishedCode);
    expect(codes).not.toContain(hiddenCode);
  });

  it('still applies the private code when entered by code', async () => {
    const { discount, amount } = await service.computeDiscount(hiddenCode, '200.00', 'any-user');

    expect(discount.code).toBe(hiddenCode);
    expect(new Prisma.Decimal(amount).toFixed(2)).toBe('20.00');
  });

  it('publishes the private code on update', async () => {
    const hidden = await prisma.discount.findUniqueOrThrow({ where: { code: hiddenCode } });
    await service.update(hidden.id, { showOnPromoPage: true });

    const codes = (await service.findActivePublic()).data.map((d) => d.code);
    expect(codes).toContain(hiddenCode);
  });
});
