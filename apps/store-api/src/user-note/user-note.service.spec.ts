import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { UserNoteService } from './user-note.service';
import { UserNoteRepository, USER_NOTES_LIMIT } from './user-note.repository';
import { UserRepository } from '../user';

const CUSTOMER_ID = 'user-uuid-1';
const AUTHOR_ID = 'manager-uuid-1';

const customer = {
  id: CUSTOMER_ID,
  email: 'olena@example.com',
  originalEmail: null,
  role: 'CUSTOMER' as UserRole,
};

const author = {
  id: AUTHOR_ID,
  email: 'manager@example.com',
  originalEmail: null,
  role: 'MANAGER' as UserRole,
};

function makeNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'note-uuid-1',
    userId: CUSTOMER_ID,
    authorId: AUTHOR_ID,
    authorEmail: 'manager@example.com',
    body: 'Просив передзвонити після 18:00.',
    createdAt: new Date('2026-09-13T10:24:00.000Z'),
    ...overrides,
  };
}

describe('UserNoteService (TASK-430)', () => {
  let service: UserNoteService;

  const noteRepositoryMock = {
    findByUserId: jest.fn(),
    countByUserId: jest.fn(),
    create: jest.fn(),
  };

  // Two DIFFERENT lookups, and keeping them apart is the point (TASK-476):
  // `findCustomerById` resolves the TARGET and is scoped to `role: CUSTOMER`,
  // while `findById` resolves the AUTHOR, who is staff by definition. A mock that
  // answered both from one function would pass even if the service went back to
  // the unscoped lookup for the target.
  const userRepositoryMock = {
    findById: jest.fn(),
    findCustomerById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserNoteService,
        { provide: UserNoteRepository, useValue: noteRepositoryMock },
        { provide: UserRepository, useValue: userRepositoryMock },
      ],
    }).compile();
    service = module.get(UserNoteService);
  });

  describe('findByUser', () => {
    it('returns the journal newest-first with the true total', async () => {
      userRepositoryMock.findCustomerById.mockResolvedValue(customer);
      noteRepositoryMock.findByUserId.mockResolvedValue([makeNote()]);
      noteRepositoryMock.countByUserId.mockResolvedValue(128);

      const result = await service.findByUser(CUSTOMER_ID);

      expect(noteRepositoryMock.findByUserId).toHaveBeenCalledWith(CUSTOMER_ID, USER_NOTES_LIMIT);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].authorEmail).toBe('manager@example.com');
      // `total` is the count of ALL entries, not of the page — the panel says
      // «показано останні 50 з 128» off the back of it, and reporting the page
      // length here would turn a truncated journal into a complete-looking one.
      expect(result.meta).toEqual({ total: 128, limit: USER_NOTES_LIMIT });
    });

    it('404s for an unknown or soft-deleted customer instead of an empty list', async () => {
      // The distinction matters on a card reached by a pasted id: "this customer
      // has no notes" and "there is no such customer" must not look identical.
      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await expect(service.findByUser('missing')).rejects.toThrow(NotFoundException);
      expect(noteRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });

    it('404s for a STAFF id exactly as for a missing one — no existence oracle', async () => {
      // `customers:read` is GRANTABLE, so an operator hired to phone customers
      // holds it. Before TASK-476's scoping reached this module the unscoped
      // lookup answered 200 with an empty journal for the owner's id and 404 for
      // an unknown one, which is enough to enumerate the people who run the shop.
      // `findCustomerById` is what makes the two answers identical; asserting on
      // the CALL is what stops a future edit reaching for `findById` again.
      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await expect(service.findByUser('owner-uuid-1')).rejects.toThrow(NotFoundException);
      expect(userRepositoryMock.findCustomerById).toHaveBeenCalledWith('owner-uuid-1');
      expect(userRepositoryMock.findById).not.toHaveBeenCalled();
      expect(noteRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('stamps the author id and a snapshot of their email', async () => {
      userRepositoryMock.findCustomerById.mockResolvedValue(customer);
      userRepositoryMock.findById.mockResolvedValue(author);
      noteRepositoryMock.create.mockResolvedValue(makeNote());

      const note = await service.create(CUSTOMER_ID, AUTHOR_ID, {
        body: 'Просив передзвонити після 18:00.',
      });

      expect(noteRepositoryMock.create).toHaveBeenCalledWith({
        userId: CUSTOMER_ID,
        authorId: AUTHOR_ID,
        authorEmail: 'manager@example.com',
        body: 'Просив передзвонити після 18:00.',
      });
      expect(note.body).toBe('Просив передзвонити після 18:00.');
    });

    it("prefers a soft-deleted author's originalEmail over the mangled address", async () => {
      userRepositoryMock.findCustomerById.mockResolvedValue(customer);
      userRepositoryMock.findById.mockResolvedValue({
        ...author,
        email: `deleted:${AUTHOR_ID}:manager@example.com`,
        originalEmail: 'manager@example.com',
      });
      noteRepositoryMock.create.mockResolvedValue(makeNote());

      await service.create(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });

      expect(noteRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorEmail: 'manager@example.com' }),
      );
    });

    it('still writes the note when the author cannot be resolved', async () => {
      // Losing the author's name is bad; losing the note the operator just typed
      // is worse. The id is kept either way, so the entry is still traceable.
      userRepositoryMock.findCustomerById.mockResolvedValue(customer);
      userRepositoryMock.findById.mockResolvedValue(null);
      noteRepositoryMock.create.mockResolvedValue(makeNote({ authorEmail: null }));

      const note = await service.create(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });

      expect(noteRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: AUTHOR_ID, authorEmail: null }),
      );
      expect(note.authorEmail).toBeNull();
    });

    it('404s before writing anything when the customer does not exist', async () => {
      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await expect(service.create('missing', AUTHOR_ID, { body: 'текст' })).rejects.toThrow(
        NotFoundException,
      );
      expect(noteRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses to attach a note to a STAFF row, the owner included', async () => {
      // With `customers:write` — grantable — the unscoped lookup let an operator
      // append a note to the owner's user row, stamped with their own address.
      // Scoping the target makes the attempt indistinguishable from a typo.
      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await expect(service.create('owner-uuid-1', AUTHOR_ID, { body: 'текст' })).rejects.toThrow(
        NotFoundException,
      );
      expect(userRepositoryMock.findCustomerById).toHaveBeenCalledWith('owner-uuid-1');
      expect(noteRepositoryMock.create).not.toHaveBeenCalled();
    });
  });
});
