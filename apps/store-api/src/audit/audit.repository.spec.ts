import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { AuditRepository } from './audit.repository';

const prismaMock = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: { findUnique: jest.fn() },
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
});
