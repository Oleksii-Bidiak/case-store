import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { CartEntity, CartTotals } from './entities';

/**
 * Response envelope for cart operations.
 * All cart endpoints return the full cart with totals.
 */
class CartResponseEnvelope {
  data!: CartEntity;
}

@ApiTags('Cart')
@ApiExtraModels(CartEntity, CartTotals, CartResponseEnvelope)
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /api/cart
   *
   * Get the current user's cart with all items and calculated totals.
   * Creates an empty cart if none exists.
   */
  @Get()
  @ApiOperation({ summary: 'Get current user cart', operationId: 'getCart' })
  @ApiResponse({
    status: 200,
    description: 'Cart with items and totals',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCart(@CurrentUser('id') userId: string): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.getCart(userId);
    return { data: cart };
  }

  /**
   * POST /api/cart/items
   *
   * Add an item to the cart. If the same product+variant combination
   * already exists, the quantity is incremented.
   * Returns the updated cart with recalculated totals.
   */
  @Post('items')
  @ApiOperation({ summary: 'Add item to cart', operationId: 'addToCart' })
  @ApiResponse({
    status: 201,
    description: 'Item added to cart',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input, out of stock, or inactive product' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addToCart(
    @CurrentUser('id') userId: string,
    @Body() dto: AddToCartDto,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.addToCart(userId, dto);
    return { data: cart };
  }

  /**
   * PATCH /api/cart/items/:itemId
   *
   * Update a cart item's quantity. If quantity is 0, the item is removed.
   * Returns the updated cart with recalculated totals.
   */
  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity', operationId: 'updateCartItem' })
  @ApiParam({ name: 'itemId', description: 'Cart item UUID' })
  @ApiResponse({
    status: 200,
    description: 'Item quantity updated',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid quantity or exceeds stock' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async updateItem(
    @CurrentUser('id') userId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.updateItem(userId, itemId, dto);
    return { data: cart };
  }

  /**
   * DELETE /api/cart/items/:itemId
   *
   * Remove an item from the cart.
   * Returns the updated cart with recalculated totals.
   */
  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart', operationId: 'removeCartItem' })
  @ApiParam({ name: 'itemId', description: 'Cart item UUID' })
  @ApiResponse({
    status: 200,
    description: 'Item removed from cart',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeItem(
    @CurrentUser('id') userId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.removeItem(userId, itemId);
    return { data: cart };
  }

  /**
   * DELETE /api/cart
   *
   * Clear all items from the cart.
   * Returns an empty cart with zero totals.
   */
  @Delete()
  @ApiOperation({ summary: 'Clear cart', operationId: 'clearCart' })
  @ApiResponse({
    status: 200,
    description: 'Cart cleared',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async clearCart(@CurrentUser('id') userId: string): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.clearCart(userId);
    return { data: cart };
  }
}
