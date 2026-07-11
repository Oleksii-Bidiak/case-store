import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { OptionalJwtAuthGuard } from './guards';
import { CartIdentityInterceptor } from './interceptors';
import { CartIdentity } from './decorators';
import type { ResolvedCartIdentity } from './cart-identity.types';
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
@UseGuards(OptionalJwtAuthGuard)
@UseInterceptors(CartIdentityInterceptor)
@ApiCookieAuth('cart-token')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /api/cart
   *
   * Get the current cart (guest or user) with all items and calculated totals.
   * Creates an empty cart if none exists. Guests receive an HttpOnly cartToken
   * cookie identifying their cart.
   */
  @Get()
  @ApiOperation({ summary: 'Get current cart (guest or user)', operationId: 'getCart' })
  @ApiResponse({
    status: 200,
    description: 'Guest or user cart with items and totals',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  async getCart(@CartIdentity() identity: ResolvedCartIdentity): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.getCart(identity);
    return { data: cart };
  }

  /**
   * POST /api/cart/items
   *
   * Add an item to the cart. If the same product+variant combination
   * already exists, the quantity is incremented.
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
  async addToCart(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Body() dto: AddToCartDto,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.addToCart(identity, dto);
    return { data: cart };
  }

  /**
   * PATCH /api/cart/items/:itemId
   *
   * Update a cart item's quantity. If quantity is 0, the item is removed.
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
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async updateItem(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.updateItem(identity, itemId, dto);
    return { data: cart };
  }

  /**
   * DELETE /api/cart/items/:itemId
   *
   * Remove an item from the cart.
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
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeItem(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Param('itemId') itemId: string,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.removeItem(identity, itemId);
    return { data: cart };
  }

  /**
   * POST /api/cart/items/:itemId/addons/:addonServiceId
   *
   * Select an add-on service (warranty / insurance / setup) on a cart line
   * (TASK-174). Rejected with a 400 when the add-on does not apply to the line's
   * product. Idempotent — selecting twice keeps a single selection.
   */
  @Post('items/:itemId/addons/:addonServiceId')
  @ApiOperation({
    summary: 'Select an add-on service on a cart line',
    operationId: 'selectCartItemAddon',
  })
  @ApiParam({ name: 'itemId', description: 'Cart item UUID' })
  @ApiParam({ name: 'addonServiceId', description: 'Add-on service UUID' })
  @ApiResponse({
    status: 201,
    description: 'Add-on selected; the full updated cart is returned',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Add-on is not available for this product' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async selectAddon(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Param('itemId') itemId: string,
    @Param('addonServiceId') addonServiceId: string,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.toggleAddon(identity, itemId, addonServiceId, true);
    return { data: cart };
  }

  /**
   * DELETE /api/cart/items/:itemId/addons/:addonServiceId
   *
   * Deselect an add-on service on a cart line (TASK-174). Idempotent — a no-op
   * when it was not selected.
   */
  @Delete('items/:itemId/addons/:addonServiceId')
  @ApiOperation({
    summary: 'Deselect an add-on service on a cart line',
    operationId: 'deselectCartItemAddon',
  })
  @ApiParam({ name: 'itemId', description: 'Cart item UUID' })
  @ApiParam({ name: 'addonServiceId', description: 'Add-on service UUID' })
  @ApiResponse({
    status: 200,
    description: 'Add-on deselected; the full updated cart is returned',
    schema: {
      allOf: [
        { $ref: getSchemaPath(CartResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CartEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async deselectAddon(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Param('itemId') itemId: string,
    @Param('addonServiceId') addonServiceId: string,
  ): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.toggleAddon(identity, itemId, addonServiceId, false);
    return { data: cart };
  }

  /**
   * DELETE /api/cart
   *
   * Clear all items from the cart.
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
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async clearCart(@CartIdentity() identity: ResolvedCartIdentity): Promise<{ data: CartEntity }> {
    const cart = await this.cartService.clearCart(identity);
    return { data: cart };
  }
}
