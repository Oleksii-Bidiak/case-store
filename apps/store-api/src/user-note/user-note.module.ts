import { Module } from '@nestjs/common';
import { UserNoteRepository } from './user-note.repository';
import { UserNoteService } from './user-note.service';
import { AdminUserNoteController } from './admin-user-note.controller';
import { UserModule } from '../user';

/**
 * UserNoteModule — the customer-notes journal (TASK-430).
 *
 * Imports `UserModule` for `UserRepository`: the existence check on the customer and
 * the author's email snapshot are reads of the USERS aggregate, and duplicating
 * them here would be a second module with its own idea of what "this user exists"
 * means (soft-deleted? inactive?) — the drift that `deletedAt` filters are famous
 * for.
 */
@Module({
  imports: [UserModule],
  controllers: [AdminUserNoteController],
  providers: [UserNoteRepository, UserNoteService],
  exports: [UserNoteService],
})
export class UserNoteModule {}
