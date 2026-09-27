import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CacheService } from '../../cache';
import { ProductIndexer } from '../../search/product-indexer';
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

const productIndexerMock = {
  index: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
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
        { provide: ProductIndexer, useValue: productIndexerMock },
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
describe('ReturnRepository.findByUserId — the customer list (TASK-608)', () => {
  let repository: ReturnRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.return.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it("scopes through the ORDER's owner, not through who pressed the button", async () => {
    await repository.findByUserId('user-1', 100);

    const args = prismaMock.return.findMany.mock.calls.at(-1)?.[0] as {
      where: unknown;
      take: number;
    };
    expect(args.where).toEqual({ order: { userId: 'user-1', deletedAt: null } });
    expect(args.take).toBe(100);
  });

  it('lists the newest request first with a stable tiebreaker', async () => {
    await repository.findByUserId('user-1', 100);

    expect(orderByOfLastFindMany()).toEqual([{ requestedAt: 'desc' }, { id: 'asc' }]);
  });
});

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
        // Third constructor dependency since TASK-417 (parallel wave): the restock
        // path re-indexes the product. This suite never reaches it, but Nest
        // resolves the whole constructor before any test runs.
        { provide: ProductIndexer, useValue: productIndexerMock },
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

describe('ReturnRepository.create — the quantity cap is checked under a lock (TASK-784)', () => {
  const ORDER_ID = 'order-uuid-1';
  const params = {
    orderId: ORDER_ID,
    createdByUserId: 'user-uuid-1',
    items: [{ orderItemId: 'order-item-1', quantity: 1 }],
  };
  const ledger = [{ status: ReturnStatus.REQUESTED, items: [{ orderItemId: 'x', quantity: 1 }] }];

  /** Every statement, in the order the transaction issued it. */
  let issued: string[];
  let repository: ReturnRepository;

  const txMock = {
    $queryRaw: jest.fn(),
    return: { findMany: jest.fn(), create: jest.fn() },
  };
  const txPrismaMock = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    issued = [];
    txMock.$queryRaw.mockImplementation(async () => {
      issued.push('lock');
      return [{ id: ORDER_ID }];
    });
    txMock.return.findMany.mockImplementation(async () => {
      issued.push('ledger');
      return ledger;
    });
    txMock.return.create.mockImplementation(async () => {
      issued.push('insert');
      return { id: 'return-uuid-1', items: [] };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: txPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it('locks the order row, reads the ledger, checks, then inserts — all in one transaction', async () => {
    const assertClaimable = jest.fn(() => {
      issued.push('check');
    });

    await repository.create(params, assertClaimable);

    expect(txPrismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(issued).toEqual(['lock', 'ledger', 'check', 'insert']);
    expect(assertClaimable).toHaveBeenCalledWith(ledger);
  });

  it('takes a row lock (FOR UPDATE) on the order being returned against', async () => {
    await repository.create(params, jest.fn());

    const [strings, ...values] = txMock.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toMatch(/FROM\s+"?orders"?[\s\S]*FOR UPDATE/i);
    expect(values).toContain(ORDER_ID);
  });

  it('reads the ledger of THIS order inside the transaction, not through the outer client', async () => {
    await repository.create(params, jest.fn());

    expect(txMock.return.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: ORDER_ID } }),
    );
  });

  it('inserts nothing when the check refuses — the error rolls the transaction back', async () => {
    const refusal = new Error('over the cap');

    await expect(
      repository.create(params, () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);
    expect(txMock.return.create).not.toHaveBeenCalled();
  });
});

describe('ReturnRepository.resolve — the refund ceilings are checked under a lock (TASK-785)', () => {
  const ORDER_ID = 'order-uuid-1';
  const RETURN_ID = 'return-uuid-1';
  const existing = {
    id: RETURN_ID,
    orderId: ORDER_ID,
    restockedAt: null,
    items: [
      {
        quantity: 2,
        orderItem: {
          productId: 'product-uuid-1',
          price: { toString: () => '499.00' },
          product: { id: 'product-uuid-1', slug: 'case' },
        },
      },
    ],
  };
  const siblings = [{ refundedAmount: { toString: () => '100.00' } }, { refundedAmount: null }];

  /** Every statement, in the order the transaction issued it. */
  let issued: string[];
  let repository: ReturnRepository;

  const txMock = {
    $queryRaw: jest.fn(),
    return: {
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    product: { update: jest.fn() },
  };
  const txPrismaMock = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    issued = [];
    txMock.return.findUniqueOrThrow.mockImplementation(async () => {
      issued.push('read');
      return existing;
    });
    txMock.$queryRaw.mockImplementation(async () => {
      issued.push('lock');
      return [{ total: { toString: () => '998.00' } }];
    });
    txMock.return.findMany.mockImplementation(async () => {
      issued.push('ledger');
      return siblings;
    });
    txMock.return.update.mockImplementation(async () => {
      issued.push('write');
      return existing;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: txPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  const fields = { status: ReturnStatus.REFUNDED, refundedAmount: '499.00' };

  it('locks the order row, reads the sibling refunds, checks, then writes — in one transaction', async () => {
    const assertRefundable = jest.fn(() => {
      issued.push('check');
    });

    await repository.resolve(RETURN_ID, fields, { assertRefundable });

    expect(txPrismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(issued.slice(0, 5)).toEqual(['read', 'lock', 'ledger', 'check', 'write']);
  });

  it("hands the check the order total, the OTHER returns and this return's priced lines", async () => {
    const assertRefundable = jest.fn();

    await repository.resolve(RETURN_ID, fields, { assertRefundable });

    const [ledger] = assertRefundable.mock.calls[0] as unknown as [
      {
        orderTotal: { toString(): string };
        otherRefunds: unknown[];
        items: Array<{ quantity: number; unitPrice: { toString(): string } }>;
      },
    ];
    expect(ledger.orderTotal.toString()).toBe('998.00');
    expect(ledger.otherRefunds).toBe(siblings);
    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0].quantity).toBe(2);
    expect(ledger.items[0].unitPrice.toString()).toBe('499.00');
  });

  it('takes a row lock (FOR UPDATE) on the order the return belongs to', async () => {
    await repository.resolve(RETURN_ID, fields, { assertRefundable: jest.fn() });

    const [strings, ...values] = txMock.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toMatch(/FROM\s+"?orders"?[\s\S]*FOR UPDATE/i);
    expect(values).toContain(ORDER_ID);
  });

  it("reads every OTHER return of the order — this one's old amount is being replaced", async () => {
    await repository.resolve(RETURN_ID, fields, { assertRefundable: jest.fn() });

    expect(txMock.return.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: ORDER_ID, id: { not: RETURN_ID } } }),
    );
  });

  it('writes nothing when the check refuses — the error rolls the transaction back', async () => {
    const refusal = new Error('over the ceiling');

    await expect(
      repository.resolve(RETURN_ID, fields, {
        assertRefundable: () => {
          throw refusal;
        },
      }),
    ).rejects.toBe(refusal);
    expect(txMock.return.update).not.toHaveBeenCalled();
    expect(txMock.return.updateMany).not.toHaveBeenCalled();
  });

  it('takes no lock when there is no refund to check', async () => {
    await repository.resolve(RETURN_ID, { status: ReturnStatus.APPROVED });

    expect(txMock.$queryRaw).not.toHaveBeenCalled();
    expect(txMock.return.findMany).not.toHaveBeenCalled();
  });
});
