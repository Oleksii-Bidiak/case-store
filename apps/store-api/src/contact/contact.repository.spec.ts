import { Test, TestingModule } from '@nestjs/testing';
import { ContactMessage, ContactMessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ContactMessagesNotFoundError, ContactRepository } from './contact.repository';
import { CONTACT_MESSAGE_SORT_FIELDS } from './dto';

const now = new Date('2026-07-05T10:00:00.000Z');

const makeMessage = (overrides: Partial<ContactMessage> = {}): ContactMessage => ({
  id: 'msg-uuid-1',
  name: 'Ivan Petrenko',
  phone: '+380671234567',
  email: 'ivan@example.com',
  topic: 'order',
  orderRef: 'ORD-10231',
  message: 'Доброго дня! Питання по замовленню.',
  status: ContactMessageStatus.NEW,
  adminNote: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const prismaMock = {
  contactMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  // The bulk path uses the CALLBACK form of $transaction — the mock hands the
  // same client back, so a `tx.` call inside is the same spy as a `prisma.` one.
  $transaction: jest.fn((callback: (tx: unknown) => unknown): unknown => callback(prismaMock)),
  // The cooldown age is computed in SQL against the database clock (TASK-763).
  $queryRaw: jest.fn(),
};

const orderByOfLastFindMany = (): unknown =>
  (prismaMock.contactMessage.findMany.mock.calls.at(-1)?.[0] as { orderBy: unknown }).orderBy;

describe('ContactRepository', () => {
  let repository: ContactRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<ContactRepository>(ContactRepository);
  });

  describe('create', () => {
    it('inserts a message with nullable topic/orderRef defaulted to null', async () => {
      const created = makeMessage({ topic: null, orderRef: null });
      prismaMock.contactMessage.create.mockResolvedValue(created);

      const result = await repository.create({
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня!',
      });

      expect(result).toBe(created);
      expect(prismaMock.contactMessage.create).toHaveBeenCalledWith({
        data: {
          name: 'Ivan Petrenko',
          phone: '+380671234567',
          email: 'ivan@example.com',
          message: 'Доброго дня!',
          topic: null,
          orderRef: null,
        },
      });
      // No hook → no transaction: the SPAM path stays one plain insert.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    describe('with an afterCreate hook (TASK-677)', () => {
      const input = {
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня!',
      };
      // A client distinct from the base one, so the test can tell them apart.
      const tx = { contactMessage: { create: jest.fn() } };

      beforeEach(() => {
        prismaMock.$transaction.mockImplementationOnce((callback: (client: unknown) => unknown) =>
          callback(tx),
        );
      });

      it('inserts through the transaction and hands the hook that tx and the created row', async () => {
        const created = makeMessage();
        tx.contactMessage.create.mockResolvedValue(created);
        const afterCreate = jest.fn().mockResolvedValue(undefined);

        const result = await repository.create(input, afterCreate);

        expect(result).toBe(created);
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.contactMessage.create).toHaveBeenCalledWith({
          data: { ...input, topic: null, orderRef: null },
        });
        expect(prismaMock.contactMessage.create).not.toHaveBeenCalled();
        expect(afterCreate).toHaveBeenCalledWith(tx, created);
      });

      it('rejects when the hook throws, so the transaction rolls the message back', async () => {
        tx.contactMessage.create.mockResolvedValue(makeMessage());

        await expect(
          repository.create(input, jest.fn().mockRejectedValue(new Error('outbox down'))),
        ).rejects.toThrow('outbox down');
      });
    });
  });

  describe('findAll', () => {
    it('lists messages newest-first with pagination and no status filter — SPAM left out (TASK-761)', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([makeMessage()]);
      prismaMock.contactMessage.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ messages: [makeMessage()], total: 1 });
      expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({
        where: { status: { not: ContactMessageStatus.SPAM } },
      });
      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { not: ContactMessageStatus.SPAM } },
          skip: 0,
          take: 20,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('applies the status filter and computes skip from the page', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([]);
      prismaMock.contactMessage.count.mockResolvedValue(0);

      await repository.findAll({ page: 3, limit: 10, status: ContactMessageStatus.ARCHIVED });

      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ContactMessageStatus.ARCHIVED },
          skip: 20,
          take: 10,
        }),
      );
      expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({
        where: { status: ContactMessageStatus.ARCHIVED },
      });
    });

    it('reaches the SPAM rows only when asked for them (TASK-761)', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([]);
      prismaMock.contactMessage.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, status: ContactMessageStatus.SPAM });

      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ContactMessageStatus.SPAM } }),
      );
    });

    describe('sorting (TASK-354)', () => {
      beforeEach(() => {
        prismaMock.contactMessage.findMany.mockResolvedValue([]);
        prismaMock.contactMessage.count.mockResolvedValue(0);
      });

      it('sorts by the requested column and direction', async () => {
        await repository.findAll({ page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' });

        expect(orderByOfLastFindMany()).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      });

      it('always appends id as the final tiebreaker so pagination is stable', async () => {
        // Without it, ties on a non-unique column are ordered arbitrarily per
        // query and a message can appear on two pages while another appears on
        // none — which reads as a message vanishing from the inbox.
        for (const field of CONTACT_MESSAGE_SORT_FIELDS) {
          await repository.findAll({ page: 1, limit: 20, sortBy: field, sortOrder: 'desc' });
          expect(orderByOfLastFindMany()).toEqual([expect.anything(), { id: 'asc' }]);
        }
      });

      it('falls back to newest-first for an unrecognised column', async () => {
        // Defence in depth behind the DTO's `@IsIn` — an internal caller that
        // hands over rubbish gets the previous behaviour, not a Prisma error.
        await repository.findAll({
          page: 1,
          limit: 20,
          sortBy: 'adminNote' as never,
        });

        expect(orderByOfLastFindMany()).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
      });
    });

    /**
     * Free-text search (TASK-423). The inbox had none — so "the message from that
     * customer last week" meant reading the queue page by page.
     *
     * Every assertion is on the WHERE SHAPE. Both failures it guards against are
     * invisible on screen: a missing `mode: 'insensitive'` stops «Іван» matching
     * `іван` (Postgres `contains` is case-sensitive by default), and an
     * un-normalised phone arm finds nothing at all, because the column holds
     * `380XXXXXXXXX` while the operator types what the customer dictates.
     */
    describe('search (TASK-423)', () => {
      beforeEach(() => {
        prismaMock.contactMessage.findMany.mockResolvedValue([]);
        prismaMock.contactMessage.count.mockResolvedValue(0);
      });

      /** The `where` the last page query was issued with. */
      function issuedWhere(): { OR?: Array<Record<string, unknown>> } {
        return (
          prismaMock.contactMessage.findMany.mock.calls.at(-1)?.[0] as {
            where: { OR?: Array<Record<string, unknown>> };
          }
        ).where;
      }

      it('ORs a text term across name, email, topic, order ref and body', async () => {
        await repository.findAll({ page: 1, limit: 20, search: 'Іван' });

        expect(issuedWhere().OR).toEqual([
          { name: { contains: 'Іван', mode: 'insensitive' } },
          { email: { contains: 'Іван', mode: 'insensitive' } },
          { topic: { contains: 'Іван', mode: 'insensitive' } },
          { orderRef: { contains: 'Іван', mode: 'insensitive' } },
          { message: { contains: 'Іван', mode: 'insensitive' } },
        ]);
      });

      it('adds no phone arm for a term with too few digits', async () => {
        // `normalizeUaPhone('Іван')` is '', and `contains: ''` matches EVERY row —
        // a name search would silently become "show me the whole inbox".
        await repository.findAll({ page: 1, limit: 20, search: 'Іван' });

        expect(JSON.stringify(issuedWhere().OR)).not.toContain('phone');
      });

      it('normalises a dictated phone number the way the column stores it', async () => {
        await repository.findAll({ page: 1, limit: 20, search: '067 123 45 67' });

        expect(issuedWhere().OR).toContainEqual({ phone: { contains: '380671234567' } });
      });

      it('matches a leading operator-code fragment as a prefix of the stored form', async () => {
        // `067` normalises to `38067`, which IS a prefix of the stored
        // `380671234567` — so narrowing by an operator code works, which is the
        // reason the digit floor is 3 and not the full number's length.
        await repository.findAll({ page: 1, limit: 20, search: '067' });

        expect(issuedWhere().OR).toContainEqual({ phone: { contains: '38067' } });
      });

      it('composes with the status filter instead of replacing it', async () => {
        await repository.findAll({
          page: 1,
          limit: 20,
          status: ContactMessageStatus.NEW,
          search: 'Іван',
        });

        const where = issuedWhere() as { status?: unknown; OR?: unknown };
        expect(where.status).toBe(ContactMessageStatus.NEW);
        expect(where.OR).toBeDefined();
      });

      it('narrows the count query identically, or the pager lies', async () => {
        await repository.findAll({ page: 1, limit: 20, search: 'Іван' });

        expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({ where: issuedWhere() });
      });

      it('adds no OR when no term is given', async () => {
        await repository.findAll({ page: 1, limit: 20 });

        expect(issuedWhere().OR).toBeUndefined();
      });
    });
  });

  describe('findById', () => {
    it('delegates to prisma.findUnique', async () => {
      const msg = makeMessage();
      prismaMock.contactMessage.findUnique.mockResolvedValue(msg);

      const result = await repository.findById('msg-uuid-1');

      expect(result).toBe(msg);
      expect(prismaMock.contactMessage.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
      });
    });
  });

  describe('update', () => {
    it('writes only the status when only status is provided', async () => {
      const updated = makeMessage({ status: ContactMessageStatus.READ });
      prismaMock.contactMessage.update.mockResolvedValue(updated);

      const result = await repository.update('msg-uuid-1', {
        status: ContactMessageStatus.READ,
      });

      expect(result).toBe(updated);
      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: { status: ContactMessageStatus.READ },
      });
    });

    it('writes both status and adminNote when both are provided', async () => {
      prismaMock.contactMessage.update.mockResolvedValue(makeMessage());

      await repository.update('msg-uuid-1', {
        status: ContactMessageStatus.ARCHIVED,
        adminNote: 'Resolved by phone',
      });

      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: { status: ContactMessageStatus.ARCHIVED, adminNote: 'Resolved by phone' },
      });
    });

    it('omits undefined fields from the update payload', async () => {
      prismaMock.contactMessage.update.mockResolvedValue(makeMessage());

      await repository.update('msg-uuid-1', {});

      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: {},
      });
    });
  });

  describe('setStatusMany (TASK-354)', () => {
    const ids = ['msg-uuid-1', 'msg-uuid-2'];

    it('writes the status onto every named message inside one transaction', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([
        { id: 'msg-uuid-1' },
        { id: 'msg-uuid-2' },
      ]);
      prismaMock.contactMessage.updateMany.mockResolvedValue({ count: 2 });

      const result = await repository.setStatusMany(ids, ContactMessageStatus.READ);

      expect(result).toBe(2);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.contactMessage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ids } },
        data: { status: ContactMessageStatus.READ },
      });
    });

    it('aborts the whole batch when an id is unknown, naming the missing ones', async () => {
      // A colleague archiving the same message a second earlier is exactly this
      // case on a shared inbox — nothing is written, so the operator's selection
      // and the inbox cannot end up half-agreeing.
      prismaMock.contactMessage.findMany.mockResolvedValue([{ id: 'msg-uuid-1' }]);

      await expect(repository.setStatusMany(ids, ContactMessageStatus.READ)).rejects.toThrow(
        ContactMessagesNotFoundError,
      );
      await expect(repository.setStatusMany(ids, ContactMessageStatus.READ)).rejects.toThrow(
        'msg-uuid-2',
      );
      expect(prismaMock.contactMessage.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findMatchingUserId (TASK-256)', () => {
    it('returns the user id when a non-deleted user matches the email', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      const result = await repository.findMatchingUserId('ivan@example.com');

      expect(result).toBe('user-uuid-1');
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'ivan@example.com', deletedAt: null },
        select: { id: true },
      });
    });

    it('returns null when no user matches (or the match is soft-deleted)', async () => {
      // The `deletedAt: null` filter in the where clause is what excludes
      // soft-deleted users — asserted on the call above; Prisma then returns null.
      prismaMock.user.findFirst.mockResolvedValue(null);

      const result = await repository.findMatchingUserId('ghost@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findMatchingUserIds (TASK-256)', () => {
    it('resolves a batched email→id map with a single query', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'user-uuid-1', email: 'ivan@example.com' },
        { id: 'user-uuid-2', email: 'olena@example.com' },
      ]);

      const result = await repository.findMatchingUserIds([
        'ivan@example.com',
        'olena@example.com',
        'stranger@example.com',
      ]);

      expect(result.get('ivan@example.com')).toBe('user-uuid-1');
      expect(result.get('olena@example.com')).toBe('user-uuid-2');
      expect(result.has('stranger@example.com')).toBe(false);
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          email: { in: ['ivan@example.com', 'olena@example.com', 'stranger@example.com'] },
          deletedAt: null,
        },
        select: { id: true, email: true },
      });
    });

    it('short-circuits to an empty Map without querying for an empty email list', async () => {
      const result = await repository.findMatchingUserIds([]);

      expect(result.size).toBe(0);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });
  });

  // What Postgres actually matches — case, the index, the clock — is proven by
  // test/contact-cooldown.int-spec.ts against a real database; this only pins
  // the shape of the query and of the answer.
  describe('findLatestMessageAgeMsByEmail (TASK-452, TASK-763)', () => {
    /** The SQL text of the last raw query, placeholders and all. */
    const lastSql = (): string =>
      (prismaMock.$queryRaw.mock.calls.at(-1)?.[0] as TemplateStringsArray).join('?');

    it('returns the age of the newest message in milliseconds', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ age_ms: 61000.5 }]);

      await expect(repository.findLatestMessageAgeMsByEmail('ivan@example.com')).resolves.toBe(
        61000.5,
      );
      expect(prismaMock.$queryRaw.mock.calls.at(-1)?.slice(1)).toEqual(['ivan@example.com']);
    });

    it('matches exactly (no ILIKE) and measures against the database clock', () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      return repository.findLatestMessageAgeMsByEmail('ivan@example.com').then(() => {
        const sql = lastSql();
        expect(sql).toMatch(/WHERE email = \?/);
        expect(sql).not.toMatch(/ILIKE|lower\(/i);
        expect(sql).toMatch(/now\(\) AT TIME ZONE 'UTC'/);
        expect(sql).toMatch(/ORDER BY created_at DESC\s+LIMIT 1/);
        // TASK-761: a bot using someone's address must not lock them out.
        expect(sql).toMatch(/status <> 'SPAM'/);
      });
    });

    it('returns null when that email never wrote', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(
        repository.findLatestMessageAgeMsByEmail('ghost@example.com'),
      ).resolves.toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('counts messages in the given status', async () => {
      prismaMock.contactMessage.count.mockResolvedValue(4);

      const result = await repository.countByStatus(ContactMessageStatus.NEW);

      expect(result).toBe(4);
      expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({
        where: { status: ContactMessageStatus.NEW },
      });
    });
  });
});
