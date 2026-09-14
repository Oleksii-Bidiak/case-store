import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { ReviewEntity, AdminReviewEntity, ReviewReplyEntity } from './entities';
import { AdminReviewQueryDto, BulkReviewModerationDto, CreateReviewReplyDto } from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { CurrentUser } from '../auth';

/**
 * Pagination metadata for the admin moderation queue.
 */
class AdminReviewPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 7 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for the admin moderation queue.
 */
class AdminReviewListResponseEnvelope {
  @ApiProperty({ type: [AdminReviewEntity], description: 'Reviews for the current page' })
  data!: AdminReviewEntity[];

  @ApiProperty({ type: AdminReviewPaginationMeta })
  meta!: AdminReviewPaginationMeta;
}

/**
 * Response envelope for a single approved review.
 */
class AdminReviewResponseEnvelope {
  @ApiProperty({ type: ReviewEntity })
  data!: ReviewEntity;
}

/**
 * Admin-only review moderation endpoints, gated on `reviews:moderate` (TASK-334).
 *
 *   GET   /api/admin/reviews             — queue (pending|approved|rejected)
 *   PATCH /api/admin/reviews/:id/approve — publish a review's text
 *   PATCH /api/admin/reviews/:id/reject  — turn down a review's text
 *   POST  /api/admin/reviews/:id/reply   — answer as the shop (`reviews:write`)
 *
 * Every moderation action here is about the TEXT (TASK-585). None of them touches
 * the rating, which counts on its own the moment it is given. The reply (TASK-587)
 * is not moderation at all — it is the shop speaking — and carries its own
 * permission, which overrides the controller's.
 *
 * Separate from the public {@link import('./review.controller').ReviewController}
 * — mirrors the AdminOrderController vs OrderController split.
 */
/**
 * What a bulk moderation call reports back: how many rows the database actually
 * wrote — which is the number the operator's confirmation should quote, not the
 * number they asked for.
 */
class BulkReviewModerationResult {
  @ApiProperty({ description: 'Review texts written', example: 7 })
  updatedCount!: number;
}

class BulkReviewModerationResponse {
  @ApiProperty({ type: BulkReviewModerationResult })
  data!: BulkReviewModerationResult;
}

/**
 * Response envelope for the shop's reply — the same two fields a customer sees,
 * so an operator can never be shown an author name the storefront does not have.
 */
class ReviewReplyResponseEnvelope {
  @ApiProperty({ type: ReviewReplyEntity })
  data!: ReviewReplyEntity;
}

@ApiTags('Reviews')
@ApiExtraModels(
  AdminReviewEntity,
  ReviewEntity,
  AdminReviewPaginationMeta,
  AdminReviewListResponseEnvelope,
  AdminReviewResponseEnvelope,
  BulkReviewModerationResult,
  BulkReviewModerationResponse,
  ReviewReplyEntity,
  ReviewReplyResponseEnvelope,
)
@Controller('admin/reviews')
@UseGuards(PermissionGuard)
@RequirePermission('reviews:moderate')
export class AdminReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * GET /api/admin/reviews
   *
   * Paginated moderation queue. `status=pending` (default) lists texts awaiting a
   * verdict, `status=approved` the published ones, `status=rejected` the turned-down
   * ones — a pile that only exists because rejecting stopped deleting (TASK-585).
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List reviews for moderation (admin)',
    operationId: 'adminReviewControllerList',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter: pending | approved | rejected',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Free-text search over review text, author email and product name',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated moderation queue',
    type: AdminReviewListResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async list(@Query() query: AdminReviewQueryDto): Promise<AdminReviewListResponseEnvelope> {
    return this.reviewService.getReviewsForModeration(query);
  }

  /**
   * PATCH /api/admin/reviews/moderate
   *
   * Approve or reject many review TEXTS at once (TASK-356) — the per-row buttons
   * below, applied to the operator's selection, in one transaction.
   *
   * `reject` no longer deletes (TASK-585): it writes `textStatus = REJECTED` and
   * leaves every rating counting. The payload still names the action rather than
   * carrying a boolean, because approve and reject are two verdicts among three
   * states, not two ends of one switch — `PENDING` is the third and no action
   * returns to it.
   *
   * DECLARED BEFORE the `:id` routes. `moderate` is one segment and `:id/approve`
   * is two, so nothing shadows it today — but that holds only until someone adds
   * a single-segment `@Patch(':id')`, and by then the failure would look like a
   * validation error about a malformed UUID.
   *
   * Inherits `PermissionGuard` + `reviews:moderate` from the controller, which
   * is also what makes the global `AuditInterceptor` record the call.
   */
  @Patch('moderate')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Approve or reject reviews in bulk (admin)',
    operationId: 'adminReviewControllerModerateMany',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of review texts written',
    type: BulkReviewModerationResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error — empty, oversized or non-UUID ids' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Unknown review id — nothing was written' })
  async moderateMany(@Body() dto: BulkReviewModerationDto): Promise<BulkReviewModerationResponse> {
    const updatedCount = await this.reviewService.moderateMany(dto.ids, dto.action);

    return { data: { updatedCount } };
  }

  /**
   * PATCH /api/admin/reviews/:id/approve
   *
   * Approve a pending review so it appears on the storefront.
   */
  @Patch(':id/approve')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Approve a review (admin)',
    operationId: 'adminReviewControllerApprove',
  })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Review approved', type: AdminReviewResponseEnvelope })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async approve(@Param('id') id: string): Promise<AdminReviewResponseEnvelope> {
    const review = await this.reviewService.approveReview(id);
    return { data: review };
  }

  /**
   * PATCH /api/admin/reviews/:id/reject
   *
   * Turn down a review's TEXT. The row stays and the rating keeps counting
   * (TASK-585).
   *
   * Was `DELETE /api/admin/reviews/:id`. The verb had to change with the
   * behaviour: a DELETE that leaves the row in place is a lie to every client that
   * reads the method, and this one would be read by an admin panel deciding
   * whether to warn the operator that something is about to be destroyed.
   *
   * `operationId` is deliberately unchanged, so the generated frontend hook keeps
   * its name and the panel's call site is a verb/URL change rather than a rename.
   */
  @Patch(':id/reject')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reject a review text (admin)',
    operationId: 'adminReviewControllerReject',
  })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({
    status: 200,
    description: 'Review text rejected; the rating is untouched',
    type: AdminReviewResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async reject(@Param('id') id: string): Promise<AdminReviewResponseEnvelope> {
    const review = await this.reviewService.rejectReview(id);
    return { data: review };
  }

  /**
   * POST /api/admin/reviews/:id/reply
   *
   * The shop answers a review (TASK-587, owner's decision of 2026-09-14). Only the
   * shop answers — there is no author thread — and the customer byline under the
   * review stays «Покупець».
   *
   * UPSERT, NOT APPEND. One reply per review, enforced by the `@unique` on
   * `ReviewReply.reviewId`. Posting again REPLACES the text, because correcting a
   * published answer is an ordinary need and a second row would be a review with
   * two shop answers and no rule about which one renders.
   *
   * `authorUserId` is stamped from the acting admin FOR ACCOUNTABILITY and is not
   * shown to customers — {@link ReviewReplyEntity} carries the body and the date
   * and nothing else. This is not an oversight to be "fixed" by rendering the
   * name: the storefront speaks as the shop, deliberately.
   *
   * ITS OWN PERMISSION, overriding the controller's. `PermissionGuard` treats a
   * handler-level `@RequirePermission` as a full override of the class-level one,
   * so this route needs `reviews:write` and does NOT accept `reviews:moderate`.
   * The split is the point: moderating is a judgement about somebody else's
   * sentence, replying is the business speaking in public.
   *
   * ROUTE ORDER: a POST, and the only one on this controller, so nothing can
   * shadow it today. It is still declared among the `:id` routes rather than
   * above them for the reason spelled out on `@Patch('moderate')` — a future
   * `@Post(':id')` added ABOVE this line would swallow `/:id/reply`, and the
   * failure would read as a malformed-UUID complaint rather than a routing bug.
   */
  @Post(':id/reply')
  // 200, not the POST default of 201: on the second call this replaces an answer
  // that already exists, and "Created" would be the wrong word for it half the
  // time. One status for one operation the operator cannot tell apart.
  @HttpCode(HttpStatus.OK)
  @RequirePermission('reviews:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reply to a review as the shop (admin)',
    operationId: 'adminReviewControllerReply',
  })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({
    status: 200,
    description: 'Reply saved — replacing the previous one if there was any',
    type: ReviewReplyResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Validation error — empty or oversized reply' })
  @ApiResponse({ status: 403, description: 'Forbidden — reviews:write required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async reply(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body() dto: CreateReviewReplyDto,
  ): Promise<ReviewReplyResponseEnvelope> {
    const saved = await this.reviewService.replyToReview(id, adminUserId, dto);
    return { data: saved };
  }
}
