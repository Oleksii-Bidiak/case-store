import { Injectable } from '@nestjs/common';
import type { UserNote } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Row written to `user_notes`. The author is stamped by the service from the
 *  authenticated actor — never taken from the request body. */
export interface CreateUserNoteInput {
  userId: string;
  authorId: string | null;
  authorEmail: string | null;
  body: string;
}

/**
 * How many entries one card returns. The journal is append-only and unbounded,
 * and «показати всі» pagination on a side panel nobody pages through would be
 * ceremony — but an unbounded read on a customer with a thousand entries would
 * quietly become the slowest query on the card, so the read is capped and the UI
 * says when it is showing only the newest.
 */
export const USER_NOTES_LIMIT = 50;

/**
 * UserNoteRepository — every Prisma query against `user_notes` and nothing else
 * (TASK-430).
 *
 * It deliberately does NOT read the `users` table: the customer-exists check and
 * the author's email snapshot both come from `UserRepository`, injected into the
 * service. One aggregate per repository is the rule this module follows rather
 * than the shortcut `AuditRepository` had to take (that one may not import the
 * auth module at all, or the two form a cycle — this one has no such constraint).
 */
@Injectable()
export class UserNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One customer's notes, newest first — the only read this table has, and the
   * one the `(user_id, created_at DESC)` index serves.
   */
  findByUserId(userId: string, limit: number = USER_NOTES_LIMIT): Promise<UserNote[]> {
    return this.prisma.userNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Total entries for one customer — so the UI can say that it is showing the
   *  newest `USER_NOTES_LIMIT` of a longer journal. */
  countByUserId(userId: string): Promise<number> {
    return this.prisma.userNote.count({ where: { userId } });
  }

  /** Append one entry. There is no update and no delete, by design. */
  create(input: CreateUserNoteInput): Promise<UserNote> {
    return this.prisma.userNote.create({ data: input });
  }
}
