// User notes module — public API (TASK-430)
export { UserNoteModule } from './user-note.module';
export { UserNoteService, type UserNoteListResult } from './user-note.service';
export {
  UserNoteRepository,
  USER_NOTES_LIMIT,
  type CreateUserNoteInput,
} from './user-note.repository';
export {
  AdminUserNoteController,
  UserNoteListResponse,
  UserNoteResponseEnvelope,
} from './admin-user-note.controller';
export { UserNoteEntity } from './entities';
export { CreateUserNoteDto, USER_NOTE_MAX_LENGTH } from './dto';
