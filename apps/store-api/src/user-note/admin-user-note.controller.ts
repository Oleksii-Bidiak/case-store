import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserNoteService } from './user-note.service';
import { CreateUserNoteDto } from './dto';
import { UserNoteEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { CurrentUser } from '../auth/decorators';

/** Pagination-ish metadata: the journal is capped per read, so the panel can say
 *  «показано останні 50 з 128» instead of silently truncating. */
class UserNoteListMeta {
  @ApiProperty({ description: 'Total notes this customer has', example: 128 })
  total!: number;

  @ApiProperty({ description: 'Maximum notes returned by one read', example: 50 })
  limit!: number;
}

/** Response envelope for the notes journal. */
export class UserNoteListResponse {
  @ApiProperty({ type: [UserNoteEntity], description: 'Notes, newest first' })
  data!: UserNoteEntity[];

  @ApiProperty({ type: UserNoteListMeta })
  meta!: UserNoteListMeta;
}

/** Response envelope for a single appended note. */
export class UserNoteResponseEnvelope {
  @ApiProperty({ type: UserNoteEntity })
  data!: UserNoteEntity;
}

/**
 * Staff notes about a customer (TASK-430).
 *
 *   GET  /api/admin/users/:userId/notes — the journal, newest first
 *   POST /api/admin/users/:userId/notes — append one entry
 *
 * ── Why this lives under `admin/` and in its own controller ─────────────────
 * The notes are STAFF-ONLY. Nothing a customer can reach may ever return them, and
 * the cheapest structural guarantee of that is the path: `permission.catalog.spec`
 * fails the build for any route under `admin/` that is not behind
 * `PermissionGuard` with a declared requirement, so the staff-only property is
 * enforced by a test rather than by everyone remembering. `UserController` sits at
 * `users` (it also serves `/users/me`, which customers DO call), so adding the
 * notes there would have put them on a path where that rule does not apply.
 *
 * ── Permissions ────────────────────────────────────────────────────────────
 * `customers:read` to read, `customers:write` to write — both already in the
 * catalogue, both already held by whoever can open the customer card at all. A new
 * key would have defaulted to denied for MANAGER and silently hidden the panel from
 * the people who take the phone calls these notes come from.
 *
 * There is no PATCH and no DELETE. That is the shape the owner chose on 2026-09-11:
 * a journal, where the only way to correct an entry is to write another one. See
 * the `UserNote` model comment.
 */
@ApiTags('Users')
@ApiExtraModels(UserNoteEntity, UserNoteListResponse, UserNoteResponseEnvelope, UserNoteListMeta)
@Controller('admin/users/:userId/notes')
@UseGuards(PermissionGuard)
export class AdminUserNoteController {
  constructor(private readonly userNoteService: UserNoteService) {}

  /**
   * GET /api/admin/users/:userId/notes — the customer's note journal.
   */
  @Get()
  @RequirePermission('customers:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List staff notes about a customer (admin)',
    operationId: 'listUserNotes',
  })
  @ApiParam({ name: 'userId', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Notes, newest first', type: UserNoteListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — customers:read required' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  list(@Param('userId') userId: string): Promise<UserNoteListResponse> {
    return this.userNoteService.findByUser(userId);
  }

  /**
   * POST /api/admin/users/:userId/notes — append one note.
   *
   * The author comes from the access token's subject, never from the body.
   */
  @Post()
  @RequirePermission('customers:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Add a staff note about a customer (admin)',
    operationId: 'createUserNote',
  })
  @ApiParam({ name: 'userId', description: 'Customer UUID' })
  @ApiResponse({ status: 201, description: 'Note appended', type: UserNoteResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Empty or over-long note' })
  @ApiResponse({ status: 403, description: 'Forbidden — customers:write required' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async create(
    @Param('userId') userId: string,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateUserNoteDto,
  ): Promise<UserNoteResponseEnvelope> {
    const note = await this.userNoteService.create(userId, authorId, dto);

    return { data: note };
  }
}
