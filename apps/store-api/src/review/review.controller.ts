import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
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
import { FailClosedThrottle, ReviewSubmissionThrottle } from '../throttler';
import { ReviewService, PaginationMeta } from './review.service';
import { ReviewEntity, ReviewAggregateEntity, OwnReviewEntity } from './entities';
import { CreateReviewDto, ReviewListQueryDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../auth';

/**
 * Pagination metadata for paginated review lists. Declared as a decorated class
 * (not a bare interface) so Swagger emits a schema and Orval generates a typed
 * client model.
 */
class ReviewPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 2 })
  totalPages!: number;
}

/**
 * Response envelope for a single submitted review.
 */
class ReviewResponseEnvelope {
  @ApiProperty({ type: ReviewEntity })
  data!: ReviewEntity;
}

/**
 * Response envelope for the author's own review — `data` is null when they have
 * not reviewed the product, which is the normal answer, not an error.
 */
class OwnReviewResponseEnvelope {
  @ApiProperty({
    type: OwnReviewEntity,
    nullable: true,
    description: 'The caller’s own review of this product, or null if they have none',
  })
  data!: OwnReviewEntity | null;
}

/**
 * Response envelope for the public product-reviews list: the page of approved
 * reviews, the product's rating aggregate, and pagination metadata.
 */
class ReviewListResponseEnvelope {
  @ApiProperty({ type: [ReviewEntity], description: 'Approved reviews for the current page' })
  data!: ReviewEntity[];

  @ApiProperty({ type: ReviewAggregateEntity })
  aggregate!: ReviewAggregateEntity;

  @ApiProperty({ type: ReviewPaginationMeta })
  meta!: ReviewPaginationMeta;
}

/**
 * Public + authenticated product-review endpoints.
 *
 *   POST /api/products/:productId/reviews       — submit (auth required)
 *   GET  /api/products/:productId/reviews       — public approved list + aggregate
 *   GET  /api/products/:productId/reviews/mine  — the caller's own review (auth required)
 *
 * The product is addressed by its UUID (`:productId`), not slug: the PDP client
 * already holds the product id, avoiding an extra slug→id lookup per fetch.
 */
@ApiTags('Reviews')
@ApiExtraModels(
  ReviewEntity,
  ReviewAggregateEntity,
  OwnReviewEntity,
  ReviewPaginationMeta,
  ReviewResponseEnvelope,
  ReviewListResponseEnvelope,
  OwnReviewResponseEnvelope,
)
@Controller('products/:productId/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * POST /api/products/:productId/reviews
   *
   * Submit a review for the product as the authenticated user. The TEXT is
   * created pending and only appears on the storefront once a moderator approves
   * it; the RATING counts immediately, unless the author's address is still
   * unconfirmed (TASK-588).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  // Two caps, and deliberately two (TASK-588, the owner's decision 7): five an
  // hour from one ACCOUNT, twenty a day from one ADDRESS. They answer different
  // questions — one person reviewing the whole catalogue, versus one address
  // running a farm of accounts — so they are separate named buckets with
  // separate counters. See `throttler.config.ts` for the numbers.
  //
  // This replaces a flat `@Throttle({ default: { limit: 10, ttl: 60000 } })`,
  // which both of the above subsume: nobody who may write five ratings an hour
  // can reach ten in a minute.
  @ReviewSubmissionThrottle()
  // Authenticated, but a single stolen or throwaway account with no working cap
  // can flood the moderation queue for every product (TASK-401).
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Submit a product review', operationId: 'reviewControllerSubmit' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({
    status: 201,
    description: 'Review submitted (pending)',
    type: ReviewResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Validation error (rating out of range)' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 409, description: 'You have already reviewed this product' })
  async submit(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    // `req.ip`, which applies the `trust proxy` setting — behind Caddy the raw
    // socket address is the proxy container's and would make the whole shop look
    // like one address. Never read from a header here: `X-Forwarded-For` is
    // attacker-controlled, and this value feeds an abuse signal.
    @Ip() createdIp: string,
  ): Promise<ReviewResponseEnvelope> {
    const review = await this.reviewService.submitReview(userId, productId, dto, createdIp ?? null);
    return { data: review };
  }

  /**
   * GET /api/products/:productId/reviews
   *
   * Public list of approved reviews for the product, plus the rating aggregate
   * and pagination metadata. No authentication required.
   */
  @Get()
  @ApiOperation({
    summary: 'List approved product reviews',
    operationId: 'reviewControllerList',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 50)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated approved reviews with aggregate',
    type: ReviewListResponseEnvelope,
  })
  async list(
    @Param('productId') productId: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<{ data: ReviewEntity[]; aggregate: ReviewAggregateEntity; meta: PaginationMeta }> {
    return this.reviewService.getApprovedReviews(productId, query);
  }

  /**
   * GET /api/products/:productId/reviews/mine
   *
   * The caller's own review of this product, or null (TASK-586). Without it the
   * storefront cannot know there is a rating to add text to: the public list
   * above shows approved TEXTS only, so a star-only row — exactly the case
   * «дописати текст» exists for — is invisible there by design.
   *
   * DECLARED WITH A LITERAL PATH AHEAD OF ANY `:id` ROUTE, for the same reason
   * `AdminReviewController.moderateMany` puts `@Patch('moderate')` above
   * `@Patch(':id/approve')`: Nest matches in declaration order, so a `@Get(':id')`
   * added above this line would swallow `/mine` and hand the id "mine" to a UUID
   * lookup. The failure would surface as a 404 or a validation complaint about a
   * malformed id — nothing that reads as a routing problem. There is no such
   * route here today; this note is what keeps it from being added carelessly.
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "The caller's own review of this product",
    operationId: 'reviewControllerMine',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'The caller’s own review, or null when they have not reviewed this product',
    type: OwnReviewResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async mine(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
  ): Promise<OwnReviewResponseEnvelope> {
    const review = await this.reviewService.getOwnReview(userId, productId);
    return { data: review };
  }
}
