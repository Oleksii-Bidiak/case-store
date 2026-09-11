import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { Throttle } from '@nestjs/throttler';
import { FailClosedThrottle } from '../throttler';
import { ReviewService, PaginationMeta } from './review.service';
import { ReviewEntity, ReviewAggregateEntity } from './entities';
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
 *   POST /api/products/:productId/reviews  — submit (auth required)
 *   GET  /api/products/:productId/reviews  — public approved list + aggregate
 *
 * The product is addressed by its UUID (`:productId`), not slug: the PDP client
 * already holds the product id, avoiding an extra slug→id lookup per fetch.
 */
@ApiTags('Reviews')
@ApiExtraModels(
  ReviewEntity,
  ReviewAggregateEntity,
  ReviewPaginationMeta,
  ReviewResponseEnvelope,
  ReviewListResponseEnvelope,
)
@Controller('products/:productId/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * POST /api/products/:productId/reviews
   *
   * Submit a review for the product as the authenticated user. The review is
   * created pending (`isActive: false`) and only appears on the storefront once
   * an admin approves it.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  // Writing a review is a state mutation and a spam target; cap below the
  // global limit.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
  ): Promise<ReviewResponseEnvelope> {
    const review = await this.reviewService.submitReview(userId, productId, dto);
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
}
