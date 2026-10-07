import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { PickupPointRepository } from '../src/delivery/pickup-point.repository';

/**
 * Deleting a pickup point against a REAL Postgres (TASK-645).
 *
 * The promise the admin screen makes — "delete is safe, the order keeps what it
 * said" — rests on two database facts no mocked suite can see: the
 * `orders.pickup_point_id` FK is `ON DELETE SET NULL` (not RESTRICT, which would
 * 500; not CASCADE, which would take orders with it), and the address snapshot
 * lives in the order's own JSON. Both are asserted on the persisted row.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('PickupPointRepository.delete — orders keep their snapshot (integration)', () => {
  let prisma: PrismaService;
  let repo: PickupPointRepository;
  const created: { orderIds: string[]; pointIds: string[] } = { orderIds: [], pointIds: [] };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, PickupPointRepository],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(PickupPointRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
      await prisma.pickupPoint.deleteMany({ where: { id: { in: created.pointIds } } });
      await prisma.$disconnect();
    }
  });

  it('unlinks the order (FK SetNull) and leaves its shippingAddress snapshot untouched', async () => {
    const suffix = randomUUID().slice(0, 8);
    const point = await repo.create({
      name: `Точка ${suffix}`,
      city: 'Київ',
      address: 'вул. Хрещатик, 1',
      workingHours: 'Пн–Пт 10–19',
    });
    created.pointIds.push(point.id);

    const snapshot = {
      firstName: 'Олена',
      lastName: 'Коваль',
      phone: '380501112233',
      city: point.city,
      address1: point.address,
      deliveryMethod: DeliveryMethod.PICKUP,
      carrier: null,
      pickupPointName: point.name,
      pickupPointAddress: point.address,
      pickupPointHours: 'Пн–Пт 10–19',
    };
    const order = await prisma.order.create({
      data: {
        subtotal: new Prisma.Decimal('100.00'),
        total: new Prisma.Decimal('100.00'),
        deliveryMethod: DeliveryMethod.PICKUP,
        pickupPointId: point.id,
        shippingAddress: snapshot,
      },
    });
    created.orderIds.push(order.id);

    // The admin list counts the reference before the operator decides.
    const listed = (await repo.listAll()).find((p) => p.id === point.id);
    expect(listed?.ordersCount).toBe(1);

    await repo.delete(point.id);

    expect(await prisma.pickupPoint.findUnique({ where: { id: point.id } })).toBeNull();
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.pickupPointId).toBeNull();
    expect(after.deliveryMethod).toBe(DeliveryMethod.PICKUP);
    expect(after.shippingAddress).toEqual(snapshot);
  });

  it('appends new points at max(sortOrder) + 1', async () => {
    const first = await repo.create({ name: 'A', city: 'c', address: 'a' });
    const second = await repo.create({ name: 'B', city: 'c', address: 'a' });
    created.pointIds.push(first.id, second.id);

    expect(second.sortOrder).toBe(first.sortOrder + 1);
  });
});
