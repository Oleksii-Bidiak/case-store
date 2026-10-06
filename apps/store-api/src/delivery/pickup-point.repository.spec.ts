import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { ReorderNotFoundError, ReorderStaleError } from '../common/reorder';
import {
  ADMIN_PICKUP_POINT_SELECT,
  PICKUP_POINT_SELECT,
  PickupPointRepository,
} from './pickup-point.repository';

const point = {
  id: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11',
  name: 'Магазин на Хрещатику',
  city: 'Київ',
  address: 'вул. Хрещатик, 1',
  phone: '+380441234567',
  workingHours: 'Пн–Пт 10:00–19:00',
  mapUrl: 'https://maps.example/khreshchatyk',
};

/** A row as the admin select returns it: public fields + bookkeeping + the order count. */
const adminRow = (over: Record<string, unknown> = {}) => ({
  ...point,
  isActive: true,
  sortOrder: 0,
  _count: { orders: 0 },
  ...over,
});

/**
 * ONE delegate shared by the singleton client and the transaction client: the
 * repository writes through `tx.pickupPoint` inside a transaction (create, reorder)
 * and through `this.prisma.pickupPoint` outside one; the assertions do not care which.
 */
const pickupDelegate = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};

const txMock = {
  pickupPoint: pickupDelegate,
  // `pg_advisory_xact_lock` — taken by `create` and by `reorderAll`.
  $executeRaw: jest.fn(),
};

const prismaMock = {
  pickupPoint: pickupDelegate,
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

describe('PickupPointRepository (TASK-643)', () => {
  let repository: PickupPointRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PickupPointRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get(PickupPointRepository);
  });

  it('selects the public fields only — no timestamps, flags or ordering keys', () => {
    expect(PICKUP_POINT_SELECT).toEqual({
      id: true,
      name: true,
      city: true,
      address: true,
      phone: true,
      workingHours: true,
      mapUrl: true,
    });
  });

  describe('findActive', () => {
    it('lists active points by sortOrder, then name, then creation time', async () => {
      prismaMock.pickupPoint.findMany.mockResolvedValue([point]);

      await expect(repository.findActive()).resolves.toEqual([point]);
      expect(prismaMock.pickupPoint.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
        select: PICKUP_POINT_SELECT,
      });
    });
  });

  describe('findActiveById', () => {
    it('returns the point when it exists and is active', async () => {
      prismaMock.pickupPoint.findFirst.mockResolvedValue(point);

      await expect(repository.findActiveById(point.id)).resolves.toEqual(point);
      expect(prismaMock.pickupPoint.findFirst).toHaveBeenCalledWith({
        where: { id: point.id, isActive: true },
        select: PICKUP_POINT_SELECT,
      });
    });

    it('returns null for a missing or deactivated point', async () => {
      prismaMock.pickupPoint.findFirst.mockResolvedValue(null);

      await expect(repository.findActiveById(point.id)).resolves.toBeNull();
    });
  });

  // ─── Admin CRUD (TASK-645) ──────────────────────────────────────────────────

  it('the admin select adds the bookkeeping fields and the order count to the public ones', () => {
    expect(ADMIN_PICKUP_POINT_SELECT).toEqual({
      ...PICKUP_POINT_SELECT,
      isActive: true,
      sortOrder: true,
      _count: { select: { orders: true } },
    });
  });

  describe('listAll', () => {
    it('lists EVERY point, inactive included, in the arranged order, with ordersCount', async () => {
      prismaMock.pickupPoint.findMany.mockResolvedValue([
        adminRow({ _count: { orders: 3 } }),
        adminRow({ id: 'p2', isActive: false, sortOrder: 1 }),
      ]);

      const result = await repository.listAll();

      expect(prismaMock.pickupPoint.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
        select: ADMIN_PICKUP_POINT_SELECT,
      });
      // The domain object carries a flat `ordersCount`, never Prisma's `_count`.
      expect(result).toEqual([
        { ...point, isActive: true, sortOrder: 0, ordersCount: 3 },
        { ...point, id: 'p2', isActive: false, sortOrder: 1, ordersCount: 0 },
      ]);
      expect(result[0]).not.toHaveProperty('_count');
    });
  });

  describe('findById', () => {
    it('finds a point whatever its status', async () => {
      prismaMock.pickupPoint.findUnique.mockResolvedValue(adminRow({ isActive: false }));

      await expect(repository.findById(point.id)).resolves.toEqual({
        ...point,
        isActive: false,
        sortOrder: 0,
        ordersCount: 0,
      });
      expect(prismaMock.pickupPoint.findUnique).toHaveBeenCalledWith({
        where: { id: point.id },
        select: ADMIN_PICKUP_POINT_SELECT,
      });
    });

    it('returns null for an unknown id', async () => {
      prismaMock.pickupPoint.findUnique.mockResolvedValue(null);

      await expect(repository.findById('nope')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    const input = { name: 'Склад', city: 'Львів', address: 'вул. Городоцька, 5' };

    it('appends the point to the END of the list (max + 1) under the list lock', async () => {
      prismaMock.pickupPoint.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prismaMock.pickupPoint.create.mockResolvedValue(adminRow({ ...input, sortOrder: 5 }));

      const result = await repository.create(input);

      expect(result.sortOrder).toBe(5);
      // The max read MUST happen inside the locked transaction, or two concurrent
      // creates read the same max and collide on one slot.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.pickupPoint.aggregate).toHaveBeenCalledWith({ _max: { sortOrder: true } });
      expect(prismaMock.pickupPoint.create).toHaveBeenCalledWith({
        data: {
          ...input,
          phone: null,
          workingHours: null,
          mapUrl: null,
          isActive: true,
          sortOrder: 5,
        },
        select: ADMIN_PICKUP_POINT_SELECT,
      });
    });

    it('uses slot 0 for the first point and keeps the optional fields it was given', async () => {
      prismaMock.pickupPoint.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.pickupPoint.create.mockResolvedValue(adminRow());

      await repository.create({
        ...input,
        phone: '+380441234567',
        workingHours: 'Пн–Пт 10–19',
        mapUrl: 'https://maps.example/x',
        isActive: false,
      });

      expect(prismaMock.pickupPoint.create).toHaveBeenCalledWith({
        data: {
          ...input,
          phone: '+380441234567',
          workingHours: 'Пн–Пт 10–19',
          mapUrl: 'https://maps.example/x',
          isActive: false,
          sortOrder: 0,
        },
        select: ADMIN_PICKUP_POINT_SELECT,
      });
    });
  });

  describe('update', () => {
    it('writes only the provided fields and returns the domain object', async () => {
      prismaMock.pickupPoint.update.mockResolvedValue(adminRow({ isActive: false }));

      const result = await repository.update(point.id, { isActive: false, phone: null });

      expect(prismaMock.pickupPoint.update).toHaveBeenCalledWith({
        where: { id: point.id },
        data: { isActive: false, phone: null },
        select: ADMIN_PICKUP_POINT_SELECT,
      });
      expect(result).toMatchObject({ isActive: false, ordersCount: 0 });
    });
  });

  describe('delete', () => {
    it('hard-deletes the row (orders keep their snapshot; the FK is SetNull)', async () => {
      prismaMock.pickupPoint.delete.mockResolvedValue(adminRow());

      await repository.delete(point.id);

      expect(prismaMock.pickupPoint.delete).toHaveBeenCalledWith({ where: { id: point.id } });
    });
  });

  describe('reorderAll', () => {
    const a = '550e8400-e29b-41d4-a716-446655440001';
    const b = '550e8400-e29b-41d4-a716-446655440002';

    it('locks the list, writes the index as sortOrder and returns the refreshed list', async () => {
      prismaMock.pickupPoint.findMany
        // 1) the in-transaction snapshot of the list's membership
        .mockResolvedValueOnce([
          { id: a, sortOrder: 0 },
          { id: b, sortOrder: 1 },
        ])
        // 2) the refreshed admin list, read inside the same transaction
        .mockResolvedValueOnce([
          adminRow({ id: b, sortOrder: 0 }),
          adminRow({ id: a, sortOrder: 1 }),
        ]);

      const result = await repository.reorderAll([b, a]);

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.pickupPoint.updateMany).toHaveBeenCalledWith({
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.pickupPoint.updateMany).toHaveBeenCalledWith({
        where: { id: a },
        data: { sortOrder: 1 },
      });
      expect(result.map((p) => p.id)).toEqual([b, a]);
      expect(result[0]).toHaveProperty('ordersCount', 0);
    });

    it('rejects a PARTIAL ordering (a point appeared underneath the client) as stale', async () => {
      prismaMock.pickupPoint.findMany.mockResolvedValueOnce([
        { id: a, sortOrder: 0 },
        { id: b, sortOrder: 1 },
      ]);

      await expect(repository.reorderAll([a])).rejects.toBeInstanceOf(ReorderStaleError);
      expect(prismaMock.pickupPoint.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a pickup point', async () => {
      prismaMock.pickupPoint.findMany.mockResolvedValueOnce([{ id: a, sortOrder: 0 }]);

      await expect(repository.reorderAll([b])).rejects.toBeInstanceOf(ReorderNotFoundError);
    });
  });
});
