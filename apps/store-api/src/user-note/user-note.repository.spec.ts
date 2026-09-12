import { Test, TestingModule } from '@nestjs/testing';
import { UserNoteRepository, USER_NOTES_LIMIT } from './user-note.repository';
import { PrismaService } from '../prisma';

/**
 * Prisma is mocked, so what is under test is the QUERY SHAPE — which is the whole
 * risk in a repository this small. Two of these would be invisible on screen: an
 * `orderBy` that drifts to ascending turns a journal into a history that starts in
 * 2024, and a missing `take` turns the side panel into an unbounded read.
 */
describe('UserNoteRepository (TASK-430)', () => {
  let repo: UserNoteRepository;

  const findMany = jest.fn();
  const count = jest.fn();
  const create = jest.fn();

  const prismaMock = { userNote: { findMany, count, create } };

  beforeEach(async () => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserNoteRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(UserNoteRepository);
  });

  it('reads one customer newest-first, capped', async () => {
    await repo.findByUserId('user-uuid-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-uuid-1' },
      orderBy: { createdAt: 'desc' },
      take: USER_NOTES_LIMIT,
    });
  });

  it('honours an explicit limit', async () => {
    await repo.findByUserId('user-uuid-1', 5);

    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 5 });
  });

  it('counts the same customer', async () => {
    await repo.countByUserId('user-uuid-1');

    expect(count).toHaveBeenCalledWith({ where: { userId: 'user-uuid-1' } });
  });

  it('writes exactly the fields it was given — no author from the request body', async () => {
    create.mockResolvedValue({});

    await repo.create({
      userId: 'user-uuid-1',
      authorId: 'manager-uuid-1',
      authorEmail: 'manager@example.com',
      body: 'текст',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-uuid-1',
        authorId: 'manager-uuid-1',
        authorEmail: 'manager@example.com',
        body: 'текст',
      },
    });
  });

  it('exposes no update and no delete', () => {
    // The append-only shape is the owner's decision (2026-09-11), so it is worth a
    // test: an `update` added here later would be a silent overwrite of a
    // colleague's entry — the exact failure the journal exists to prevent.
    const surface = Object.getOwnPropertyNames(UserNoteRepository.prototype);

    expect(surface).not.toContain('update');
    expect(surface).not.toContain('delete');
    expect(surface).not.toContain('remove');
  });
});
