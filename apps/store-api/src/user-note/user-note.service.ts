import { Injectable, NotFoundException } from '@nestjs/common';
import { UserNoteRepository, USER_NOTES_LIMIT } from './user-note.repository';
import { UserNoteEntity } from './entities';
import { CreateUserNoteDto } from './dto';
import { UserRepository } from '../user';

/** What the notes panel renders: the newest entries plus the true total. */
export interface UserNoteListResult {
  data: UserNoteEntity[];
  meta: { total: number; limit: number };
}

/**
 * UserNoteService — the customer-notes journal (TASK-430).
 *
 * Two operations, and deliberately no more: read a customer's notes, append one.
 * No edit and no delete, because the owner asked for a journal rather than a
 * field — see the `UserNote` model comment for why overwriting is the failure
 * mode that matters here.
 *
 * The author is resolved SERVER-SIDE from the authenticated actor's id: the
 * controller passes the id the JWT guard put on the request, and the email is read
 * from the users table at write time and stored alongside it. The alternative —
 * joining the author at read time — loses the author the moment the account is
 * deleted, which is exactly what the audit log documents and avoids.
 */
@Injectable()
export class UserNoteService {
  constructor(
    private readonly noteRepository: UserNoteRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * A customer's notes, newest first.
   *
   * 404s on an unknown (or soft-deleted) customer rather than returning an empty
   * list: on a card reached by a pasted id, "no notes" and "no such customer" must
   * not look the same.
   */
  async findByUser(userId: string): Promise<UserNoteListResult> {
    await this.requireCustomer(userId);

    const [notes, total] = await Promise.all([
      this.noteRepository.findByUserId(userId, USER_NOTES_LIMIT),
      this.noteRepository.countByUserId(userId),
    ]);

    return {
      data: notes.map((note) => UserNoteEntity.fromPrisma(note)),
      meta: { total, limit: USER_NOTES_LIMIT },
    };
  }

  /**
   * Append one note about a customer, stamped with the acting staff account.
   *
   * `authorEmail` is a snapshot, not a join — see the class comment. A missing
   * author row (an actor deleted between the guard's read and this one, which is
   * possible if unlikely) stores `null` rather than failing the write: losing the
   * author's name is bad, losing the note the operator just typed is worse.
   */
  async create(userId: string, authorId: string, dto: CreateUserNoteDto): Promise<UserNoteEntity> {
    await this.requireCustomer(userId);

    const author = await this.userRepository.findById(authorId);

    const note = await this.noteRepository.create({
      userId,
      authorId,
      // A soft-deleted account's `email` is mangled to `deleted:<id>:<address>`;
      // `originalEmail` holds the readable one. Same fallback as the audit log.
      authorEmail: author ? (author.originalEmail ?? author.email) : null,
      body: dto.body,
    });

    return UserNoteEntity.fromPrisma(note);
  }

  /** Shared 404 guard — the customer must exist and not be soft-deleted. */
  private async requireCustomer(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}
