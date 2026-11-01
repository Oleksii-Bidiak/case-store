import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  Prisma,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CacheService } from '../../cache';
import { ProductIndexer } from '../../search/product-indexer';
import { ReturnRepository } from './return.repository';
import { OrderMoneyRepository } from '../order-money.repository';

/** The ledger repository: only decide/setCredit reach it, and only with a credit change. */
const moneyRepositoryMock = {
  recompute: jest.fn(),
  returnPaidOutKop: jest.fn().mockResolvedValue(0),
  syncReturnStatus: jest.fn(),
};
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
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
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
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
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
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
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
    channel: ReturnChannel.ACCOUNT,
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
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
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

  // TASK-677: the customer door's shop ping rides the same transaction.
  it('runs afterCreate inside the transaction, after the insert, with the tx and the new return', async () => {
    const afterCreate = jest.fn(async () => {
      issued.push('hook');
    });

    const created = await repository.create(params, jest.fn(), afterCreate);

    expect(txPrismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(issued).toEqual(['lock', 'ledger', 'insert', 'hook']);
    expect(afterCreate).toHaveBeenCalledWith(txMock, created);
  });

  it('rejects when afterCreate throws, so the return is rolled back with it', async () => {
    await expect(
      repository.create(params, jest.fn(), jest.fn().mockRejectedValue(new Error('outbox down'))),
    ).rejects.toThrow('outbox down');
  });

  it('never calls a hook when the check refuses', async () => {
    const afterCreate = jest.fn();

    await expect(
      repository.create(
        params,
        () => {
          throw new Error('over the cap');
        },
        afterCreate,
      ),
    ).rejects.toThrow('over the cap');
    expect(afterCreate).not.toHaveBeenCalled();
  });
});

describe('ReturnRepository.resolve — the guarded transition (TASK-340, TASK-1961)', () => {
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
  /** What the service validated the move against (TASK-1961/2044). */
  const current = {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: ReturnStatus.RECEIVED,
    decision: ReturnDecision.REFUND,
  };

  /** Every statement, in the order the transaction issued it. */
  let issued: string[];
  let repository: ReturnRepository;

  const txMock = {
    $queryRaw: jest.fn(),
    return: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
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
    txMock.return.updateMany.mockImplementation(async () => {
      issued.push('write');
      return { count: 1 };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: txPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it('takes no lock when there is no refund to check', async () => {
    await repository.resolve(current, { status: ReturnStatus.APPROVED });

    expect(txMock.$queryRaw).not.toHaveBeenCalled();
    expect(txMock.return.findMany).not.toHaveBeenCalled();
  });

  // TASK-1966: the loser of a concurrent restock is refused from INSIDE the
  // transaction, and must carry the same code the service's early check does —
  // otherwise the admin panel shows two different messages for one fact.
  it('409 RETURN_ALREADY_RESTOCKED when the stamp was taken meanwhile, touching no product', async () => {
    txMock.return.updateMany.mockResolvedValue({ count: 0 });
    txMock.return.findUnique.mockResolvedValue({ restockedAt: new Date() });

    const caught = await repository
      .resolve(
        { ...current, status: ReturnStatus.APPROVED },
        { status: ReturnStatus.RECEIVED },
        { restock: true },
      )
      .then(
        () => {
          throw new Error('expected a refusal');
        },
        (error: unknown) => error,
      );

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      error: 'RETURN_ALREADY_RESTOCKED',
      message: 'These returned goods have already been credited back to inventory',
    });
    expect(txMock.product.update).not.toHaveBeenCalled();
  });

  // ── The state guard (TASK-1961, TASK-2044) ─────────────────────────────────
  // The service validated the move against a read taken OUTSIDE this
  // transaction. A decision committed in between (a refusal, a switch to
  // replacement) must not be overwritten by a write keyed on the id alone.

  it('writes only while the return still holds the status and decision the service validated', async () => {
    await repository.resolve(current, { status: ReturnStatus.REFUNDED });

    expect(txMock.return.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RETURN_ID, status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND },
      }),
    );
    expect(txMock.return.update).not.toHaveBeenCalled();
  });

  it('409 RETURN_TRANSITION_INVALID when the return moved meanwhile', async () => {
    txMock.return.updateMany.mockResolvedValue({ count: 0 });

    const caught = await repository
      .resolve(current, { status: ReturnStatus.REFUNDED })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      error: 'RETURN_TRANSITION_INVALID',
    });
  });

  it('guards the restock stamp with the validated status and decision too', async () => {
    const approved = { ...current, status: ReturnStatus.APPROVED };

    await repository.resolve(approved, { status: ReturnStatus.RECEIVED }, { restock: true });

    expect(txMock.return.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: RETURN_ID,
          status: ReturnStatus.APPROVED,
          decision: ReturnDecision.REFUND,
          restockedAt: null,
        },
      }),
    );
  });

  it('409 RETURN_TRANSITION_INVALID when a restock lost to another transition, touching no product', async () => {
    txMock.return.updateMany.mockResolvedValue({ count: 0 });
    txMock.return.findUnique.mockResolvedValue({ restockedAt: null });

    const caught = await repository
      .resolve(
        { ...current, status: ReturnStatus.APPROVED },
        { status: ReturnStatus.RECEIVED },
        { restock: true },
      )
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      error: 'RETURN_TRANSITION_INVALID',
    });
    expect(txMock.product.update).not.toHaveBeenCalled();
  });
});

describe('ReturnRepository.decide — one transaction per decision (TASK-1961, TASK-2044)', () => {
  const ORDER_ID = 'order-uuid-1';
  const RETURN_ID = 'return-uuid-1';
  const OPERATOR_ID = 'operator-uuid-1';
  const decidedAt = new Date('2026-10-31T12:00:00.000Z');

  const current = {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: ReturnStatus.REJECTED,
    decision: ReturnDecision.REJECT,
  };
  const change = {
    status: ReturnStatus.APPROVED,
    decision: ReturnDecision.REFUND,
    decisionReason: 'Чек знайшовся',
    decidedById: OPERATOR_ID,
    decidedAt,
  };
  const ledger = [{ status: ReturnStatus.REQUESTED, items: [{ orderItemId: 'x', quantity: 1 }] }];
  const decidedRow = { id: RETURN_ID, ...change, items: [] };

  /** Every statement, in the order the transaction issued it. */
  let issued: string[];
  let repository: ReturnRepository;

  const txMock = {
    $queryRaw: jest.fn(),
    return: { findMany: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    returnDecisionEvent: { create: jest.fn() },
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
    txMock.return.updateMany.mockImplementation(async () => {
      issued.push('write');
      return { count: 1 };
    });
    txMock.returnDecisionEvent.create.mockImplementation(async () => {
      issued.push('event');
      return {};
    });
    txMock.return.findUniqueOrThrow.mockImplementation(async () => {
      issued.push('read');
      return decidedRow;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: txPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it('locks the order, reads the ledger, checks, writes the decision and its event — in one transaction', async () => {
    const assertClaimable = jest.fn(() => {
      issued.push('check');
    });

    const result = await repository.decide(current, change, { assertClaimable });

    expect(txPrismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(issued).toEqual(['lock', 'ledger', 'check', 'write', 'event', 'read']);
    expect(assertClaimable).toHaveBeenCalledWith(ledger);
    expect(result).toBe(decidedRow);
  });

  it('takes the same FOR UPDATE lock on the order row that create takes', async () => {
    await repository.decide(current, change, { assertClaimable: jest.fn() });

    const [strings, orderId] = txMock.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(strings.join('?')).toMatch(/SELECT id FROM orders WHERE id = \? FOR UPDATE/);
    expect(orderId).toBe(ORDER_ID);
  });

  it("reads the OTHER returns of the order — this one's own claim is the one being re-made", async () => {
    await repository.decide(current, change, { assertClaimable: jest.fn() });

    expect(txMock.return.findMany).toHaveBeenCalledWith({
      where: { orderId: ORDER_ID, id: { not: RETURN_ID } },
      select: { status: true, items: { select: { orderItemId: true, quantity: true } } },
    });
  });

  it('reads no ledger when there is no claim to check', async () => {
    await repository.decide(current, change);

    expect(issued).toEqual(['lock', 'write', 'event', 'read']);
  });

  it('writes nothing when the check refuses — the error rolls the transaction back', async () => {
    const refusal = new ConflictException('no units left');

    await expect(
      repository.decide(current, change, {
        assertClaimable: () => {
          throw refusal;
        },
      }),
    ).rejects.toBe(refusal);
    expect(txMock.return.updateMany).not.toHaveBeenCalled();
    expect(txMock.returnDecisionEvent.create).not.toHaveBeenCalled();
  });

  it('guards the write on the status and decision the service decided against', async () => {
    await repository.decide(current, change);

    expect(txMock.return.updateMany).toHaveBeenCalledWith({
      where: { id: RETURN_ID, status: ReturnStatus.REJECTED, decision: ReturnDecision.REJECT },
      data: {
        status: ReturnStatus.APPROVED,
        decision: ReturnDecision.REFUND,
        decisionReason: 'Чек знайшовся',
        decidedAt,
        decidedById: OPERATOR_ID,
        // A decision taken by a person is no longer the backfill's inference.
        decisionLegacy: false,
        // `resolvedAt` stays "the last change" (plan, Модель даних).
        resolvedAt: decidedAt,
      },
    });
  });

  it('records the decision event with its author, reason and time', async () => {
    await repository.decide(current, change);

    expect(txMock.returnDecisionEvent.create).toHaveBeenCalledWith({
      data: {
        returnId: RETURN_ID,
        decision: ReturnDecision.REFUND,
        reason: 'Чек знайшовся',
        actorId: OPERATOR_ID,
        createdAt: decidedAt,
      },
    });
  });

  it('409 RETURN_TRANSITION_INVALID when the return changed meanwhile, recording no event', async () => {
    // Another operator moved it (e.g. marked it RECEIVED) between the service's
    // read and this transaction: the decision was taken against a state that no
    // longer exists.
    txMock.return.updateMany.mockResolvedValue({ count: 0 });

    const caught = await repository.decide(current, change).then(
      () => {
        throw new Error('expected a refusal');
      },
      (error: unknown) => error,
    );

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      error: 'RETURN_TRANSITION_INVALID',
    });
    expect(txMock.returnDecisionEvent.create).not.toHaveBeenCalled();
  });
});

describe('ReturnRepository.addRepairStep — one transaction per step (TASK-2045)', () => {
  const RETURN_ID = 'return-uuid-1';
  const OPERATOR_ID = 'operator-uuid-1';
  const createdAt = new Date('2026-10-31T12:00:00.000Z');

  const event = {
    step: ReturnRepairStep.SENT_TO_SERVICE,
    result: null,
    destination: 'СЦ Apple, Київ',
    ttn: '20450000000001',
    note: 'Подряпина на кутку',
    actorId: OPERATOR_ID,
    createdAt,
  };
  const cardRow = { id: RETURN_ID, decision: ReturnDecision.REPAIR, items: [] };

  /** Every statement, in the order the transaction issued it. */
  let issued: string[];
  let repository: ReturnRepository;

  const txMock = {
    return: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    returnRepairEvent: { create: jest.fn() },
  };
  const txPrismaMock = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    issued = [];
    txMock.return.updateMany.mockImplementation(async () => {
      issued.push('touch');
      return { count: 1 };
    });
    txMock.returnRepairEvent.create.mockImplementation(async () => {
      issued.push('event');
      return {};
    });
    txMock.return.findUniqueOrThrow.mockImplementation(async () => {
      issued.push('read');
      return cardRow;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: txPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  const caughtFrom = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('expected a refusal');
      },
      (error: unknown) => error,
    );

  it('stamps the return, writes the step and reads the card back — in one transaction', async () => {
    const result = await repository.addRepairStep(RETURN_ID, event);

    expect(txPrismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(issued).toEqual(['touch', 'event', 'read']);
    expect(result).toBe(cardRow);
  });

  it('stamps resolvedAt only while the return is still an open REPAIR — the guard and the row lock', async () => {
    await repository.addRepairStep(RETURN_ID, event);

    expect(txMock.return.updateMany).toHaveBeenCalledWith({
      where: {
        id: RETURN_ID,
        decision: ReturnDecision.REPAIR,
        status: { notIn: [ReturnStatus.REJECTED, ReturnStatus.REFUNDED] },
      },
      // `resolvedAt` stays "the last change" (plan, Модель даних).
      data: { resolvedAt: createdAt },
    });
  });

  it('writes the step with its author, its time and every detail', async () => {
    await repository.addRepairStep(RETURN_ID, event);

    expect(txMock.returnRepairEvent.create).toHaveBeenCalledWith({
      data: { returnId: RETURN_ID, ...event },
    });
  });

  it('409 RETURN_REPAIR_STEP_INVALID when the decision changed meanwhile, writing no step', async () => {
    txMock.return.updateMany.mockResolvedValue({ count: 0 });

    const caught = await caughtFrom(repository.addRepairStep(RETURN_ID, event));

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      error: 'RETURN_REPAIR_STEP_INVALID',
      message: 'Repair steps are recorded only on an open return decided as REPAIR',
    });
    expect(txMock.returnRepairEvent.create).not.toHaveBeenCalled();
  });

  it('409 RETURN_REPAIR_STEP_INVALID when a concurrent request recorded the same step first', async () => {
    // The unique index on (return_id, step) is what stops a double click: both
    // requests passed the service's order check against the same read.
    txMock.returnRepairEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
    );

    const caught = await caughtFrom(repository.addRepairStep(RETURN_ID, event));

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      error: 'RETURN_REPAIR_STEP_INVALID',
      message: 'The repair step SENT_TO_SERVICE has already been recorded',
    });
  });

  it('lets any other database error through untouched', async () => {
    const boom = new Error('connection lost');
    txMock.returnRepairEvent.create.mockRejectedValue(boom);

    await expect(repository.addRepairStep(RETURN_ID, event)).rejects.toBe(boom);
  });
});

describe('ReturnRepository — what each read loads (TASK-1963, TASK-2044, TASK-2045)', () => {
  // `originalEmail`: a soft-deleted account's readable email (TASK-104).
  const ACTOR_SELECT = {
    id: true,
    email: true,
    originalEmail: true,
    firstName: true,
    lastName: true,
  };
  const HISTORY_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

  const readMock = {
    return: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((arg: unknown): Promise<unknown> =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(readMock)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  let repository: ReturnRepository;

  type Include = Record<string, unknown>;
  const includeOf = (mock: jest.Mock): Include =>
    (mock.mock.calls.at(-1)?.[0] as { include: Include }).include;

  function expectCustomerInclude(include: Include): void {
    expect(include.repairEvents).toEqual({
      orderBy: HISTORY_ORDER,
      select: { id: true, step: true, result: true, destination: true, ttn: true, createdAt: true },
    });
    expect(include).not.toHaveProperty('createdBy');
    expect(include).not.toHaveProperty('decidedBy');
    expect(include).not.toHaveProperty('decisionEvents');
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    readMock.return.count.mockResolvedValue(0);
    readMock.return.findMany.mockResolvedValue([]);
    readMock.return.findUnique.mockResolvedValue(null);
    readMock.return.create.mockResolvedValue({ id: 'return-1', items: [] });
    readMock.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: readMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  describe('one return for the operator (findById)', () => {
    it('joins both authors with the fields a name is built from — nothing else of the account', async () => {
      await repository.findById('return-1');

      const include = includeOf(readMock.return.findUnique);
      expect(include.createdBy).toEqual({ select: ACTOR_SELECT });
      expect(include.decidedBy).toEqual({ select: ACTOR_SELECT });
    });

    it('loads the decision history and the repair steps oldest first, each with its actor', async () => {
      await repository.findById('return-1');

      const include = includeOf(readMock.return.findUnique);
      expect(include.decisionEvents).toEqual({
        orderBy: HISTORY_ORDER,
        include: { actor: { select: ACTOR_SELECT } },
      });
      expect(include.repairEvents).toEqual({
        orderBy: HISTORY_ORDER,
        include: { actor: { select: ACTOR_SELECT } },
      });
    });

    it('reads the purchase date off the order', async () => {
      await repository.findById('return-1');

      const include = includeOf(readMock.return.findUnique) as {
        order: { select: Record<string, boolean> };
      };
      expect(include.order.select.createdAt).toBe(true);
    });
  });

  // A page of the queue costs one batched query per to-one join; the history
  // arrays belong to the card, not to a page of twenty rows.
  describe('the admin queue (findAll)', () => {
    it('joins the authors and the purchase date but no history arrays', async () => {
      await repository.findAll({});

      const include = includeOf(readMock.return.findMany) as Include & {
        order: { select: Record<string, boolean> };
      };
      expect(include.createdBy).toEqual({ select: ACTOR_SELECT });
      expect(include.decidedBy).toEqual({ select: ACTOR_SELECT });
      expect(include.order.select.createdAt).toBe(true);
      expect(include).not.toHaveProperty('decisionEvents');
      expect(include).not.toHaveProperty('repairEvents');
    });
  });

  describe('the per-order list (findByOrderId)', () => {
    it('for the operator: the queue joins', async () => {
      await repository.findByOrderId('order-1', { admin: true });

      const include = includeOf(readMock.return.findMany);
      expect(include.createdBy).toEqual({ select: ACTOR_SELECT });
      expect(include).not.toHaveProperty('decisionEvents');
    });

    it('for the customer: repair progress without the note or the actor, and no staff account', async () => {
      await repository.findByOrderId('order-1');

      expectCustomerInclude(includeOf(readMock.return.findMany));
    });
  });

  describe("the customer's own list (findByUserId)", () => {
    it('repair progress without the note or the actor, and no staff account', async () => {
      await repository.findByUserId('user-1', 100);

      expectCustomerInclude(includeOf(readMock.return.findMany));
    });
  });

  describe('create', () => {
    const createArgs = () =>
      readMock.return.create.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
        include: Include;
      };

    it('writes what the customer asked for and the door it came through', async () => {
      await repository.create(
        {
          orderId: 'order-1',
          createdByUserId: 'operator-1',
          requestedOutcome: ReturnOutcome.REPAIR,
          channel: ReturnChannel.OPERATOR,
          items: [{ orderItemId: 'line-1', quantity: 1 }],
        },
        () => undefined,
      );

      expect(createArgs().data).toMatchObject({
        requestedOutcome: ReturnOutcome.REPAIR,
        channel: ReturnChannel.OPERATOR,
      });
    });

    it('writes no outcome when none was asked for — null, not a guess', async () => {
      await repository.create(
        {
          orderId: 'order-1',
          createdByUserId: 'user-1',
          channel: ReturnChannel.ACCOUNT,
          items: [{ orderItemId: 'line-1', quantity: 1 }],
        },
        () => undefined,
      );

      expect(createArgs().data).toMatchObject({
        requestedOutcome: null,
        channel: ReturnChannel.ACCOUNT,
      });
    });

    it('answers with the full card — the operator sees the return they just opened', async () => {
      await repository.create(
        { orderId: 'order-1', channel: ReturnChannel.OPERATOR, items: [] },
        () => undefined,
      );

      const include = createArgs().include;
      expect(include.createdBy).toEqual({ select: ACTOR_SELECT });
      expect(include).toHaveProperty('decisionEvents');
    });
  });
});

// Approving and refusing moved to POST /decision (TASK-1961/2044); a notes-only
// PATCH keeps the operator's notes writable on every status.
describe('ReturnRepository.updateNotes — the operator notes on any status', () => {
  const RETURN_ID = 'return-uuid-1';
  const notesPrismaMock = { return: { update: jest.fn() } };
  let repository: ReturnRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    notesPrismaMock.return.update.mockResolvedValue({ id: RETURN_ID, items: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnRepository,
        { provide: PrismaService, useValue: notesPrismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: OrderMoneyRepository, useValue: moneyRepositoryMock },
      ],
    }).compile();

    repository = module.get(ReturnRepository);
  });

  it('writes the notes and nothing else — no status, no resolution stamp, no decision', async () => {
    await repository.updateNotes(RETURN_ID, 'Дзвонив клієнт');

    const call = notesPrismaMock.return.update.mock.calls[0]?.[0] as {
      where: unknown;
      data: unknown;
      include: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: RETURN_ID });
    expect(call.data).toEqual({ operatorNotes: 'Дзвонив клієнт' });
    // The answer is the full admin card, like every other admin write.
    expect(call.include).toHaveProperty('decisionEvents');
    expect(call.include).toHaveProperty('decidedBy');
  });

  it('clears the notes with null', async () => {
    await repository.updateNotes(RETURN_ID, null);

    expect(notesPrismaMock.return.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { operatorNotes: null } }),
    );
  });
});
