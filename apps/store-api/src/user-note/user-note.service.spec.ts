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

  const userRepositoryMock = {
    findById: jest.fn(),
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
      userRepositoryMock.findById.mockResolvedValue(customer);
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
      userRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findByUser('missing')).rejects.toThrow(NotFoundException);
      expect(noteRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('stamps the author id and a snapshot of their email', async () => {
      userRepositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve(id === CUSTOMER_ID ? customer : author),
      );
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
      userRepositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === CUSTOMER_ID
            ? customer
            : {
                ...author,
                email: `deleted:${AUTHOR_ID}:manager@example.com`,
                originalEmail: 'manager@example.com',
              },
        ),
      );
      noteRepositoryMock.create.mockResolvedValue(makeNote());

      await service.create(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });

      expect(noteRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorEmail: 'manager@example.com' }),
      );
    });

    it('still writes the note when the author cannot be resolved', async () => {
      // Losing the author's name is bad; losing the note the operator just typed
      // is worse. The id is kept either way, so the entry is still traceable.
      userRepositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve(id === CUSTOMER_ID ? customer : null),
      );
      noteRepositoryMock.create.mockResolvedValue(makeNote({ authorEmail: null }));

      const note = await service.create(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });

      expect(noteRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: AUTHOR_ID, authorEmail: null }),
      );
      expect(note.authorEmail).toBeNull();
    });

    it('404s before writing anything when the customer does not exist', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.create('missing', AUTHOR_ID, { body: 'текст' })).rejects.toThrow(
        NotFoundException,
      );
      expect(noteRepositoryMock.create).not.toHaveBeenCalled();
    });
  });
});
