import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto';
import { OptionalJwtAuthGuard } from './guards';
import { WishlistIdentityInterceptor } from './interceptors';
import { WishlistIdentity } from './decorators';
import type { ResolvedWishlistIdentity } from './wishlist-identity.types';
import { WishlistEntity, WishlistItemEntity } from './entities';

/**
 * Response envelope for wishlist operations.
 * All wishlist endpoints return the full wishlist with its saved products.
 */
class WishlistResponseEnvelope {
  data!: WishlistEntity;
}

@ApiTags('Wishlist')
@ApiExtraModels(WishlistEntity, WishlistItemEntity, WishlistResponseEnvelope)
@Controller('wishlist')
@UseGuards(OptionalJwtAuthGuard)
@UseInterceptors(WishlistIdentityInterceptor)
@ApiCookieAuth('wishlist-token')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  /**
   * GET /api/wishlist
   *
   * Get the current wishlist (guest or user) with all saved products. Creates an
   * empty wishlist if none exists. Guests receive an HttpOnly wishlistToken
   * cookie identifying their list.
   */
  @Get()
  @ApiOperation({ summary: 'Get current wishlist (guest or user)', operationId: 'getWishlist' })
  @ApiResponse({
    status: 200,
    description: 'Guest or user wishlist with saved products',
    schema: {
      allOf: [
        { $ref: getSchemaPath(WishlistResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(WishlistEntity) } } },
      ],
    },
  })
  async getWishlist(
    @WishlistIdentity() identity: ResolvedWishlistIdentity,
  ): Promise<{ data: WishlistEntity }> {
    const wishlist = await this.wishlistService.getWishlist(identity);
    return { data: wishlist };
  }

  /**
   * POST /api/wishlist/items
   *
   * Add a product to the wishlist. Idempotent — re-adding a saved product is a
   * no-op.
   */
  @Post('items')
  @ApiOperation({ summary: 'Add product to wishlist', operationId: 'addToWishlist' })
  @ApiResponse({
    status: 201,
    description: 'Product added to wishlist',
    schema: {
      allOf: [
        { $ref: getSchemaPath(WishlistResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(WishlistEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addToWishlist(
    @WishlistIdentity() identity: ResolvedWishlistIdentity,
    @Body() dto: AddToWishlistDto,
  ): Promise<{ data: WishlistEntity }> {
    const wishlist = await this.wishlistService.add(identity, dto);
    return { data: wishlist };
  }

  /**
   * POST /api/wishlist/toggle
   *
   * Toggle a product in the wishlist: remove it when already saved, otherwise
   * add it. Returns the resulting wishlist.
   */
  @Post('toggle')
  @ApiOperation({ summary: 'Toggle product in wishlist', operationId: 'toggleWishlist' })
  @ApiResponse({
    status: 201,
    description: 'Product toggled in wishlist',
    schema: {
      allOf: [
        { $ref: getSchemaPath(WishlistResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(WishlistEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async toggleWishlist(
    @WishlistIdentity() identity: ResolvedWishlistIdentity,
    @Body() dto: AddToWishlistDto,
  ): Promise<{ data: WishlistEntity }> {
    const wishlist = await this.wishlistService.toggle(identity, dto);
    return { data: wishlist };
  }

  /**
   * DELETE /api/wishlist/items/:productId
   *
   * Remove a product from the wishlist. Idempotent — removing a product that is
   * not saved is a no-op.
   */
  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove product from wishlist', operationId: 'removeFromWishlist' })
  @ApiParam({ name: 'productId', description: 'Product (position) UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product removed from wishlist',
    schema: {
      allOf: [
        { $ref: getSchemaPath(WishlistResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(WishlistEntity) } } },
      ],
    },
  })
  async removeFromWishlist(
    @WishlistIdentity() identity: ResolvedWishlistIdentity,
    @Param('productId') productId: string,
  ): Promise<{ data: WishlistEntity }> {
    const wishlist = await this.wishlistService.remove(identity, productId);
    return { data: wishlist };
  }
}
