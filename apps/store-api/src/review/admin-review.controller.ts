import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { ReviewEntity, AdminReviewEntity } from './entities';
import { AdminReviewQueryDto, BulkReviewModerationDto } from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

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
 *   GET    /api/admin/reviews             — moderation queue (pending|approved)
 *   PATCH  /api/admin/reviews/:id/approve — publish a pending review
 *   DELETE /api/admin/reviews/:id         — reject (hard delete)
 *
 * Separate from the public {@link import('./review.controller').ReviewController}
 * — mirrors the AdminOrderController vs OrderController split.
 */
/**
 * What a bulk moderation call reports back: how many rows the database actually
 * wrote. For `reject` that is how many were DELETED — which is the number the
 * operator's confirmation should quote, not the number they asked for.
 */
class BulkReviewModerationResult {
  @ApiProperty({ description: 'Reviews written (for reject, deleted)', example: 7 })
  updatedCount!: number;
}

class BulkReviewModerationResponse {
  @ApiProperty({ type: BulkReviewModerationResult })
  data!: BulkReviewModerationResult;
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
)
@Controller('admin/reviews')
@UseGuards(PermissionGuard)
@RequirePermission('reviews:moderate')
export class AdminReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * GET /api/admin/reviews
   *
   * Paginated moderation queue. `status=pending` (default) lists submissions
   * awaiting approval; `status=approved` lists already-published reviews.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List reviews for moderation (admin)',
    operationId: 'adminReviewControllerList',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter: pending | approved' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 50)' })
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
   * Approve or reject many reviews at once (TASK-356) — the per-row buttons
   * below, applied to the operator's selection, in one transaction.
   *
   * **`action: "reject"` DELETES.** It is the bulk form of `DELETE :id`, which
   * hard-deletes so the author's unique `(userId, productId)` slot is freed.
   * That is why the payload names the action instead of carrying an `isActive`
   * boolean: a flag would have made an irreversible operation look like a
   * toggle, and the admin UI gates it behind a count-bearing confirmation.
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
    description: 'Number of reviews written (for `reject`, deleted)',
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
   * DELETE /api/admin/reviews/:id
   *
   * Reject a review by hard-deleting it (frees the unique slot so the author may
   * re-submit). Returns 204 No Content.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject a review (admin)', operationId: 'adminReviewControllerReject' })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({ status: 204, description: 'Review rejected (deleted)' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async reject(@Param('id') id: string): Promise<void> {
    await this.reviewService.rejectReview(id);
  }
}
