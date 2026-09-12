import { ApiProperty } from '@nestjs/swagger';
import type { UserNote } from '@prisma/client';

/**
 * One entry of a customer's staff-note journal (TASK-430).
 *
 * STAFF-ONLY. No storefront route returns this type, and none may: the notes are
 * what the shop says about a customer, not what the customer is told. The only
 * controller that produces it is `AdminUserNoteController`, under `admin/` and
 * behind `customers:read` / `customers:write`.
 *
 * `authorEmail` is what the UI shows, and it is a SNAPSHOT taken when the note was
 * written — not a join. Same decision as `AuditLog.actorEmail`, same reason: the
 * author's account may be gone by the time anyone reads the note, and a journal
 * entry whose author renders as blank is worse than no journal.
 */
export class UserNoteEntity {
  @ApiProperty({ description: 'Note id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'The customer this note is about', example: 'user-uuid-1' })
  userId!: string;

  @ApiProperty({
    description:
      'Staff account that wrote the note; null for a note written before the field existed. Carries NO foreign key — deleting the author keeps the note.',
    type: String,
    nullable: true,
    example: 'staff-uuid-1',
  })
  authorId!: string | null;

  @ApiProperty({
    description: "Author's email as it was when the note was written; null if unknown",
    type: String,
    nullable: true,
    example: 'manager@example.com',
  })
  authorEmail!: string | null;

  @ApiProperty({
    description: 'The note text (plain text)',
    example: 'Просив передзвонити після 18:00.',
  })
  body!: string;

  @ApiProperty({ description: 'When the note was written', example: '2026-09-13T10:24:00.000Z' })
  createdAt!: Date;

  /** Map a Prisma row onto the response entity. */
  static fromPrisma(note: UserNote): UserNoteEntity {
    const entity = new UserNoteEntity();
    entity.id = note.id;
    entity.userId = note.userId;
    entity.authorId = note.authorId;
    entity.authorEmail = note.authorEmail;
    entity.body = note.body;
    entity.createdAt = note.createdAt;
    return entity;
  }
}
