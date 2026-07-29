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
  $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prismaMock)),
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
    });
  });

  describe('findAll', () => {
    it('lists messages newest-first with pagination and no status filter', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([makeMessage()]);
      prismaMock.contactMessage.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ messages: [makeMessage()], total: 1 });
      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
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
