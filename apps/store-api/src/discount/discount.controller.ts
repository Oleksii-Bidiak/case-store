import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DiscountService } from './discount.service';
import { PreviewDiscountDto } from './dto';
import { DiscountPreviewEntity } from './entities';
import {
  CartIdentity,
  CartIdentityInterceptor,
  OptionalJwtAuthGuard,
  type ResolvedCartIdentity,
} from '../cart';

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
 * `POST /api/cart/discount/preview` validates a promo code against the caller's
 * current cart subtotal and returns the computed discount (advisory —
 * `createOrder` recomputes authoritatively).
 *
 * Since TASK-2010 a GUEST may preview too (B-12 тема 2 (в)): the identity is the
 * cart module's own resolution — a JWT when there is one, the `cartToken` cookie
 * otherwise — exactly as `POST /orders` resolves it, so the subtotal priced here
 * is the cart that would be ordered. A guest's answer carries
 * `requiresAccount: true`; the code is applied only to an order with an account
 * behind it, which checkout can now create.
 */
@ApiTags('Discounts')
@ApiBearerAuth('access-token')
@ApiCookieAuth('cart-token')
@Controller('cart/discount')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /**
   * POST /api/cart/discount/preview
   *
   * Preview a promo code against the caller's current cart (account or guest).
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(CartIdentityInterceptor)
  // Code-guessing is a brute-force vector — cap previews well below the global
  // rate. Kept as is now that guests reach it: the cap is per address either way.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Preview a promo code against the current cart (account or guest)',
    operationId: 'previewDiscount',
  })
  @ApiResponse({
    status: 200,
    description:
      'Computed discount. `requiresAccount: true` for a guest — the code applies only to an ' +
      'order placed with an account (checkout `contact.createAccount: true`).',
    type: DiscountPreviewResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid, inactive, expired, or below-minimum code' })
  @ApiResponse({ status: 409, description: 'Code redemption cap reached (global or per-user)' })
  async preview(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Body() dto: PreviewDiscountDto,
  ): Promise<{ data: DiscountPreviewEntity }> {
    const preview = await this.discountService.preview(identity, dto.code);
    return { data: preview };
  }
}
