import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { AuditRepository } from './audit.repository';

const prismaMock = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
};

describe('AuditRepository — findMany ordering (TASK-356)', () => {
  let repository: AuditRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get(AuditRepository);
  });

  const orderByOf = () =>
    prismaMock.auditLog.findMany.mock.calls[0][0].orderBy as Record<string, string>[];

  it('reads newest-first when nothing is requested — the log is a timeline', async () => {
    await repository.findMany({ page: 1, limit: 50 });

    expect(orderByOf()[0]).toEqual({ createdAt: 'desc' });
  });

  it.each(['createdAt', 'actorEmail', 'action'] as const)(
    'reaches Prisma with %s as the leading orderBy key',
    async (sortBy) => {
      await repository.findMany({ page: 1, limit: 50, sortBy, sortOrder: 'asc' });

      expect(orderByOf()[0]).toEqual({ [sortBy]: 'asc' });
    },
  );

  it('falls back to createdAt desc for a field outside the allow-list', async () => {
    // The DTO rejects this at the HTTP boundary; the fallback covers every other
    // caller, because a raw sortBy handed to Prisma is a query-shape injection.
    await repository.findMany({ page: 1, limit: 50, sortBy: 'ip' });

    expect(orderByOf()[0]).toEqual({ createdAt: 'desc' });
  });

  it('always ends with a unique tiebreaker so paging cannot repeat or skip an entry', async () => {
    // `action` has few distinct values over a large log, so almost every page
    // boundary falls inside a tie group — where Postgres guarantees no order.
    // On an append-only record of who did what, an entry that silently fails to
    // appear is the worst outcome this file has.
    await repository.findMany({ page: 1, limit: 50, sortBy: 'action', sortOrder: 'asc' });

    expect(orderByOf()).toEqual([{ action: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('keeps the filters independent of the sort', async () => {
    await repository.findMany({
      page: 2,
      limit: 25,
      actorId: 'admin-1',
      action: 'product.update',
      sortBy: 'actorEmail',
      sortOrder: 'desc',
    });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'admin-1', action: 'product.update' },
        skip: 25,
        take: 25,
      }),
    );
  });

  // ─── actorRole filter (TASK-430) ────────────────────────────────────────────

  it('narrows by the actor role recorded on the entry', async () => {
    await repository.findMany({ page: 1, limit: 50, actorRole: 'MANAGER' });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorRole: 'MANAGER' } }),
    );
  });

  it('narrows the count query by the role too', async () => {
    // A filter applied to the page but not to the count is a pager that offers
    // pages the list cannot show — and on this screen that reads as "entries are
    // missing", which is the one thing an audit log must never look like.
    await repository.findMany({ page: 1, limit: 50, actorRole: 'ADMIN' });

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where: { actorRole: 'ADMIN' } });
  });

  it('combines the role with the other filters rather than replacing them', async () => {
    await repository.findMany({
      page: 1,
      limit: 50,
      actorRole: 'MANAGER',
      entityType: 'order',
      actorId: 'manager-1',
    });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'manager-1', actorRole: 'MANAGER', entityType: 'order' },
      }),
    );
  });

  it('adds no actorRole clause when none is asked for', async () => {
    // Otherwise every unfiltered read would silently drop the system entries
    // (actorRole IS NULL) — payment callbacks and cron, i.e. exactly the rows
    // someone opens this screen to find when an order changed on its own.
    await repository.findMany({ page: 1, limit: 50 });

    expect(prismaMock.auditLog.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('AuditRepository — findLatestActors (TASK-1830)', () => {
  let repository: AuditRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repository = module.get(AuditRepository);
  });

  it('keeps the NEWEST entry per entity, skips actor-less ones, and joins the current names', async () => {
    // Newest first, as the query orders them.
    prismaMock.auditLog.findMany.mockResolvedValue([
      { entityId: 'p1', actorId: 'u2', actorEmail: 'second@store.com' },
      { entityId: 'p1', actorId: 'u1', actorEmail: 'first@store.com' },
      { entityId: 'p2', actorId: 'u-gone', actorEmail: 'gone@store.com' },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u2', firstName: 'Олена', lastName: 'Коваль' },
    ]);

    const result = await repository.findLatestActors('product.remove', 'product', [
      'p1',
      'p2',
      'p3',
    ]);

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'product.remove',
        entityType: 'product',
        entityId: { in: ['p1', 'p2', 'p3'] },
        actorId: { not: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { entityId: true, actorId: true, actorEmail: true },
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2', 'u-gone'] } },
      select: { id: true, firstName: true, lastName: true },
    });
    expect([...result.entries()]).toEqual([
      [
        'p1',
        { actorId: 'u2', actorEmail: 'second@store.com', firstName: 'Олена', lastName: 'Коваль' },
      ],
      // The account is gone — the entry's own email snapshot is all that is left.
      ['p2', { actorId: 'u-gone', actorEmail: 'gone@store.com', firstName: null, lastName: null }],
    ]);
  });

  it('reads nothing for an empty page', async () => {
    const result = await repository.findLatestActors('product.remove', 'product', []);

    expect(result.size).toBe(0);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
