import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CacheService } from '../../cache';
import { ReturnRepository } from './return.repository';
import { RETURN_SORT_FIELDS, ReturnListQueryDto } from './dto';

const prismaMock = {
  return: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  // The list path uses the ARRAY form of $transaction — the mock just awaits the
  // operations the repository handed it, which is what the real client does.
  $transaction: jest.fn((operations: unknown) => Promise.all(operations as Promise<unknown>[])),
};

const cacheMock = {
  del: jest.fn(),
  delByPrefix: jest.fn(),
};

const orderByOfLastFindMany = (): unknown =>
  (prismaMock.return.findMany.mock.calls.at(-1)?.[0] as { orderBy: unknown }).orderBy;

describe('ReturnRepository — admin queue sorting (TASK-354)', () => {
  let repository: ReturnRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.return.count.mockResolvedValue(0);
    prismaMock.return.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheService, useValue: cacheMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it('defaults to newest request first — the queue order that existed before sorting', async () => {
    await repository.findAll({});

    expect(orderByOfLastFindMany()).toEqual([{ requestedAt: 'desc' }, { id: 'asc' }]);
  });

  it('sorts by the requested column and direction', async () => {
    await repository.findAll({ sortBy: 'status', sortOrder: 'asc' });

    expect(orderByOfLastFindMany()).toEqual([{ status: 'asc' }, { id: 'asc' }]);
  });

  it('always appends id as the final tiebreaker so pagination is stable', async () => {
    // Without it, ties on a non-unique column are ordered arbitrarily per query
    // and a row can appear on two pages while another appears on none.
    for (const field of RETURN_SORT_FIELDS) {
      await repository.findAll({ sortBy: field, sortOrder: 'desc' });
      expect(orderByOfLastFindMany()).toEqual([expect.anything(), { id: 'asc' }]);
    }
  });

  it('pushes unrefunded returns to the bottom in BOTH directions', async () => {
    // Postgres puts NULLs first on DESC, so "biggest refund first" would open on
    // a wall of returns that have no amount at all.
    await repository.findAll({ sortBy: 'refundedAmount', sortOrder: 'desc' });
    expect(orderByOfLastFindMany()).toEqual([
      { refundedAmount: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ]);

    await repository.findAll({ sortBy: 'refundedAmount', sortOrder: 'asc' });
    expect(orderByOfLastFindMany()).toEqual([
      { refundedAmount: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('keeps the status filter and pagination working alongside the sort', async () => {
    await repository.findAll({
      status: ReturnStatus.REQUESTED,
      page: 3,
      limit: 10,
      sortBy: 'status',
      sortOrder: 'asc',
    });

    expect(prismaMock.return.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: ReturnStatus.REQUESTED }, skip: 20, take: 10 }),
    );
  });
});

describe('ReturnListQueryDto — sort validation (TASK-354)', () => {
  const errorsOf = (payload: unknown): string[] =>
    validateSync(plainToInstance(ReturnListQueryDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).flatMap((error) => Object.keys(error.constraints ?? {}));

  it('defaults to requestedAt/desc when the caller says nothing', () => {
    const dto = plainToInstance(ReturnListQueryDto, {});

    expect(dto.sortBy).toBe('requestedAt');
    expect(dto.sortOrder).toBe('desc');
  });

  it.each(RETURN_SORT_FIELDS)('accepts %s', (field) => {
    expect(errorsOf({ sortBy: field })).toEqual([]);
  });

  it('rejects a column that is not on the allow-list', () => {
    // A 400 from the boundary, not a Prisma error the operator reads as a 500 —
    // and notably not a silent fall back to the default, which would leave the
    // header arrow and the rows disagreeing.
    expect(errorsOf({ sortBy: 'operatorNotes' })).toContain('isIn');
  });

  it('rejects a sort direction that is not asc or desc', () => {
    expect(errorsOf({ sortOrder: 'sideways' })).toContain('isIn');
  });
});
