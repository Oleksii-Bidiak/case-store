import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, AddToCartInput, CartWithItems } from './cart.repository';
import { CartEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';

/**
 * Maximum quantity allowed per cart item.
 */
const MAX_QUANTITY = 99;

/**
 * CartService — business logic for the shopping cart.
 *
 * All methods return a CartEntity (domain entity) with calculated totals.
 * The service validates business rules (stock, max quantity, active status)
 * and delegates database operations to CartRepository.
 */
@Injectable()
export class CartService {
  constructor(private readonly cartRepository: CartRepository) {}

  /**
   * Get the current user's cart. Creates an empty cart if none exists.
   * Returns the cart with items and calculated totals.
   */
  async getCart(userId: string): Promise<CartEntity> {
    const cart = await this.cartRepository.findOrCreate(userId);
    return CartEntity.fromPrisma(cart);
  }

  /**
   * Add an item to the cart. If the same product+variant combination
   * already exists, the repository increments the quantity (upsert).
   *
   * After adding, validates:
   * - Product/variant is active
   * - Quantity does not exceed available stock (for variants)
   * - Quantity does not exceed max (99)
   *
   * If validation fails, the item is still in the DB (added by repository),
   * but the service throws an error. This is acceptable for MVP —
   * the repository's upsert is atomic and the next getCart() will
   * return the current state. A future improvement could roll back
   * the add on validation failure.
   */
  async addToCart(userId: string, dto: AddToCartDto): Promise<CartEntity> {
    const input: AddToCartInput = {
      userId,
      productId: dto.productId,
      variantId: dto.variantId,
      quantity: dto.quantity,
    };

    const cart = await this.cartRepository.addItem(input);

    // Validate the resulting cart items
    this.validateCartItems(cart);

    return CartEntity.fromPrisma(cart);
  }

  /**
   * Update a cart item's quantity.
   *
   * Business rules:
   * - User must own a cart (NotFoundException if not)
   * - Item must exist in the user's cart (NotFoundException if not)
   * - If quantity is 0, remove the item instead of updating
   * - If quantity > 0, validate stock and max quantity
   *
   * Returns the updated cart with recalculated totals.
   */
  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartEntity> {
    // Find the user's cart
    const cart = await this.cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    // Find the item in the cart
    const cartItem = cart.items.find((item) => item.id === itemId);

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    // If quantity is 0, remove the item
    if (dto.quantity === 0) {
      await this.cartRepository.removeItem(itemId);
      return this.getCart(userId);
    }

    // Validate max quantity
    if (dto.quantity > MAX_QUANTITY) {
      throw new BadRequestException(`Quantity cannot exceed ${MAX_QUANTITY}`);
    }

    // Validate stock availability (for variants)
    if (cartItem.variant && dto.quantity > cartItem.variant.stock) {
      throw new BadRequestException(
        `Requested quantity (${dto.quantity}) exceeds available stock (${cartItem.variant.stock})`,
      );
    }

    // Update the item
    await this.cartRepository.updateItem(itemId, { quantity: dto.quantity });

    // Return the updated cart
    return this.getCart(userId);
  }

  /**
   * Remove an item from the cart.
   *
   * Validates that the item exists in the user's cart.
   * Returns the updated cart with recalculated totals.
   */
  async removeItem(userId: string, itemId: string): Promise<CartEntity> {
    const cart = await this.cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items.find((item) => item.id === itemId);

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.removeItem(itemId);

    return this.getCart(userId);
  }

  /**
   * Clear all items from the user's cart.
   * Returns an empty cart with zero totals.
   */
  async clearCart(userId: string): Promise<CartEntity> {
    const cart = await this.cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.cartRepository.clearItems(cart.id);

    return this.getCart(userId);
  }

  /**
   * Validate all items in a cart after an add operation.
   * Checks for inactive products/variants, out-of-stock items,
   * and quantity exceeding the maximum.
   *
   * @throws BadRequestException if any validation fails
   */
  private validateCartItems(cart: CartWithItems): void {
    for (const item of cart.items) {
      // Check if product/variant is active
      const isActive = item.variant ? item.variant.isActive : item.product.isActive;
      if (!isActive) {
        throw new BadRequestException(`Product "${item.product.name}" is no longer available`);
      }

      // Check stock availability (for variants)
      if (item.variant && item.quantity > item.variant.stock) {
        throw new BadRequestException(
          `Requested quantity (${item.quantity}) exceeds available stock (${item.variant.stock}) for "${item.variant.name}"`,
        );
      }

      // Check max quantity
      if (item.quantity > MAX_QUANTITY) {
        throw new BadRequestException(`Quantity cannot exceed ${MAX_QUANTITY} per item`);
      }
    }
  }
}
