import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { PublicDiscountEntity } from './entities';

/**
 * Response envelope for the public active-discounts feed.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * and Orval generates a typed client hook.
 */
export class PublicActiveDiscountsResponseEnvelope {
  @ApiProperty({ type: [PublicDiscountEntity], description: 'Currently redeemable discount codes' })
  data!: PublicDiscountEntity[];
}

/**
 * Public storefront discounts endpoint (no auth required).
 *
 *   GET /api/discounts/active — the promo page's live "Промокоди тижня" feed.
 *
 * Separate, guard-free controller (TASK-179): the existing {@link
 * DiscountController} is class-decorated with `JwtAuthGuard`/`RolesGuard` for the
 * per-user preview, and there is no `@Public()` decorator in this codebase, so a
 * dedicated ungated controller is the established public-vs-guarded idiom (cf.
 * `FaqController` vs `AdminFaqController`). Returns the public-safe entity subset
 * only — never redemption caps/counts.
 */
@ApiTags('Discounts')
@ApiExtraModels(PublicDiscountEntity, PublicActiveDiscountsResponseEnvelope)
@Controller('discounts')
export class PublicDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /**
   * GET /api/discounts/active
   *
   * List every currently redeemable discount (active, within its start/expiry
   * window, and under its global redemption cap) for the storefront promo feed.
   * Public — no authentication.
   */
  @Get('active')
  @ApiOperation({
    summary: 'List currently active, redeemable discounts',
    operationId: 'listActiveDiscounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Currently redeemable discount codes',
    type: PublicActiveDiscountsResponseEnvelope,
  })
  async listActive(): Promise<{ data: PublicDiscountEntity[] }> {
    return this.discountService.findActivePublic();
  }
}
