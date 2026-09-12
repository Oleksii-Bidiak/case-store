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

/**
 * The returns queue's free-text search (TASK-423).
 *
 * The queue had none, so an operator on the phone with a customer holding an
 * order number could only page through it. Prisma is mocked: what is under test
 * is the WHERE SHAPE, which is where all three realistic mistakes live — an id
 * arm that forgets to lowercase (the operator reads back `ABC12345`, the column
 * holds `abc12345…`), a text arm that forgets `mode: 'insensitive'`, and an
 * unguarded phone arm that matches every row.
 */
describe('ReturnRepository — admin queue search (TASK-423)', () => {
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

  /** The `where` the last page query was issued with. */
  function issuedWhere(): { status?: unknown; OR?: Array<Record<string, unknown>> } {
    return (
      prismaMock.return.findMany.mock.calls.at(-1)?.[0] as {
        where: { status?: unknown; OR?: Array<Record<string, unknown>> };
      }
    ).where;
  }

  it('adds no OR when no term is given', async () => {
    await repository.findAll({});

    expect(issuedWhere().OR).toBeUndefined();
  });

  it('matches the return id and the order number as lowercased prefixes', async () => {
    // An operator reads an order number back in uppercase; the column holds the
    // full lowercase uuid. Without the fold, the one search term every operator
    // actually has matches nothing.
    await repository.findAll({ search: 'ABC12345' });

    expect(issuedWhere().OR).toContainEqual({ id: { startsWith: 'abc12345' } });
    expect(issuedWhere().OR).toContainEqual({ order: { id: { startsWith: 'abc12345' } } });
  });

  it('reaches the customer through the order — guest AND account email', async () => {
    await repository.findAll({ search: 'olena@example.com' });

    expect(issuedWhere().OR).toContainEqual({
      order: { guestEmail: { contains: 'olena@example.com', mode: 'insensitive' } },
    });
    expect(issuedWhere().OR).toContainEqual({
      order: { user: { email: { contains: 'olena@example.com', mode: 'insensitive' } } },
    });
  });

  it("searches the customer's stated reason", async () => {
    await repository.findAll({ search: 'подряпина' });

    expect(issuedWhere().OR).toContainEqual({
      reason: { contains: 'подряпина', mode: 'insensitive' },
    });
  });

  it('adds no phone arm for a term with too few digits', async () => {
    // `normalizeUaPhone('подряпина')` is '', and `contains: ''` matches EVERY
    // row — so an unguarded arm would turn a word search into "the whole queue".
    await repository.findAll({ search: 'подряпина' });

    expect(JSON.stringify(issuedWhere().OR)).not.toContain('Phone');
    expect(JSON.stringify(issuedWhere().OR)).not.toContain('phone');
  });

  it('normalises a dictated phone number the way the order columns store it', async () => {
    await repository.findAll({ search: '050 111 2233' });

    expect(issuedWhere().OR).toContainEqual({
      order: { guestPhone: { contains: '380501112233' } },
    });
    expect(issuedWhere().OR).toContainEqual({
      order: { user: { phone: { contains: '380501112233' } } },
    });
  });

  it('composes with the status filter instead of replacing it', async () => {
    await repository.findAll({ status: ReturnStatus.REQUESTED, search: 'ABC12345' });

    expect(issuedWhere().status).toBe(ReturnStatus.REQUESTED);
    expect(issuedWhere().OR).toBeDefined();
  });

  it('narrows the count query identically, or the pager claims pages the list has not got', async () => {
    await repository.findAll({ search: 'ABC12345' });

    expect(prismaMock.return.count).toHaveBeenCalledWith({ where: issuedWhere() });
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
