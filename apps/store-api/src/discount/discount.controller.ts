import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DiscountService } from './discount.service';
import { PreviewDiscountDto } from './dto';
import { DiscountPreviewEntity } from './entities';
import { JwtAuthGuard, CurrentUser } from '../auth';

/**
 * Response envelope for a discount preview.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * and Orval generates a typed client hook.
 */
class DiscountPreviewResponseEnvelope {
  @ApiProperty({ type: DiscountPreviewEntity })
  data!: DiscountPreviewEntity;
}

/**
 * Public storefront discount endpoint.
 *
 * `POST /api/cart/discount/preview` validates a promo code against the
 * authenticated caller's current cart subtotal and returns the computed
 * discount (advisory — `createOrder` recomputes authoritatively). Auth is
 * required so the per-user cap and the cart lookup resolve to a real account.
 */
@ApiTags('Discounts')
@ApiBearerAuth('access-token')
// `RolesGuard` stood here until TASK-475 and was doing nothing: with no `@Roles`
// metadata it returned true for any authenticated caller. Authentication IS the
// real requirement — the preview resolves the caller's own cart and their
// per-user redemption cap — so `JwtAuthGuard` alone says exactly what this route
// needs, and the set of callers it admits is unchanged.
@Controller('cart/discount')
@UseGuards(JwtAuthGuard)
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /**
   * POST /api/cart/discount/preview
   *
   * Preview a promo code against the user's current cart.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  // Code-guessing is a brute-force vector — cap previews well below the global rate.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Preview a promo code against the current cart',
    operationId: 'previewDiscount',
  })
  @ApiResponse({
    status: 200,
    description: 'Computed discount',
    type: DiscountPreviewResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid, inactive, expired, or below-minimum code' })
  @ApiResponse({ status: 409, description: 'Code redemption cap reached (global or per-user)' })
  async preview(
    @CurrentUser('id') userId: string,
    @Body() dto: PreviewDiscountDto,
  ): Promise<{ data: DiscountPreviewEntity }> {
    const preview = await this.discountService.preview(userId, dto.code);
    return { data: preview };
  }
}
