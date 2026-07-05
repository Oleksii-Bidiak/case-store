import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, AddToCartInput, CartWithItems, MergeCartLine } from './cart.repository';
import { CartEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import type { ResolvedCartIdentity } from './cart-identity.types';
import { MAX_QUANTITY } from './cart.constants';

/**
 * CartService — business logic for the shopping cart.
 *
 * All methods accept a ResolvedCartIdentity (a user identity for authenticated
 * requests, or a token identity for guests) and return a CartEntity with
 * calculated totals. The service validates business rules (stock, max quantity,
 * active status) and delegates database operations to CartRepository.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(private readonly cartRepository: CartRepository) {}

  /**
   * Get the current cart for the identity. Creates an empty cart if none exists.
   */
  async getCart(identity: ResolvedCartIdentity): Promise<CartEntity> {
    const cart = await this.cartRepository.findOrCreate(identity);
    return CartEntity.fromPrisma(cart);
  }

  /**
   * Add an item to the cart. If the same product position already exists in the
   * cart, the repository increments the quantity (upsert).
   *
   * Validate-before-write invariant: stock, `isActive`, and max-quantity are all
   * checked BEFORE the DB write, so an invalid request never persists a row (the
   * historical bug was validating after the write, leaving a "ghost" item that
   * reappeared on reload). Validation runs against the *resulting* quantity
   * (`existing line qty + incoming qty`) to match the repository's increment
   * semantics.
   */
  async addToCart(identity: ResolvedCartIdentity, dto: AddToCartDto): Promise<CartEntity> {
    const cart = await this.cartRepository.findOrCreate(identity);

    // Resulting quantity after the increment the repository will apply.
    const existingLine = cart.items.find((item) => item.productId === dto.productId);
    const resultingQuantity = (existingLine?.quantity ?? 0) + dto.quantity;

    // Product details: reuse the cart line for an existing product (already
    // loaded), otherwise fetch them for the new product.
    const product =
      existingLine?.product ??
      (await this.cartRepository.findProductForCartValidation(dto.productId));

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    this.validateAddition(product, resultingQuantity);

    const input: AddToCartInput = {
      cartId: cart.id,
      productId: dto.productId,
      quantity: dto.quantity,
    };

    const updated = await this.cartRepository.addItem(input);

    return CartEntity.fromPrisma(updated);
  }

  /**
   * Update a cart item's quantity.
   *
   * Business rules:
   * - The cart must exist (NotFoundException if not)
   * - The item must exist in the cart (NotFoundException if not)
   * - If quantity is 0, remove the item instead of updating
   * - If quantity > 0, validate stock and max quantity
   */
  async updateItem(
    identity: ResolvedCartIdentity,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartEntity> {
    const cart = await this.resolveCart(identity);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items.find((item) => item.id === itemId);

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    // If quantity is 0, remove the item
    if (dto.quantity === 0) {
      await this.cartRepository.removeItem(itemId);
      return this.getCart(identity);
    }

    // Validate max quantity
    if (dto.quantity > MAX_QUANTITY) {
      throw new BadRequestException(`Quantity cannot exceed ${MAX_QUANTITY}`);
    }

    // Validate stock availability against the position's stock.
    if (dto.quantity > cartItem.product.stock) {
      throw new BadRequestException(
        `Requested quantity (${dto.quantity}) exceeds available stock (${cartItem.product.stock})`,
      );
    }

    await this.cartRepository.updateItem(itemId, { quantity: dto.quantity });

    return this.getCart(identity);
  }

  /**
   * Remove an item from the cart.
   */
  async removeItem(identity: ResolvedCartIdentity, itemId: string): Promise<CartEntity> {
    const cart = await this.resolveCart(identity);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items.find((item) => item.id === itemId);

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.removeItem(itemId);

    return this.getCart(identity);
  }

  /**
   * Clear all items from the cart.
   */
  async clearCart(identity: ResolvedCartIdentity): Promise<CartEntity> {
    const cart = await this.resolveCart(identity);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.cartRepository.clearItems(cart.id);

    return this.getCart(identity);
  }

  /**
   * Merge a guest cart (identified by token) into the user's cart on login or
   * registration. Quantities of matching items are summed and clamped to
   * MAX_QUANTITY (and to variant stock where applicable). The guest cart is
   * deleted afterwards. A no-op when the guest cart is missing or empty.
   *
   * This must never throw in a way that blocks authentication — the caller
   * wraps it defensively.
   *
   * The item upserts and the guest-cart deletion run inside a single repository
   * transaction so a mid-merge failure cannot leave the user cart partially
   * merged or the guest cart orphaned.
   */
  async mergeGuestCart(guestToken: string, userId: string): Promise<void> {
    const guestCart = await this.cartRepository.findByToken(guestToken);

    if (!guestCart || guestCart.items.length === 0) {
      return;
    }

    let userCart = await this.cartRepository.findByUserId(userId);

    // No existing user cart → try to reassign the guest cart to the user.
    if (!userCart) {
      const reassigned = await this.cartRepository.assignCartToUser(guestCart.id, userId);
      if (reassigned) {
        return;
      }

      // Reassign hit the userId unique constraint: a user cart was created
      // concurrently (e.g. a parallel request/tab). Re-read it and merge the
      // guest items into it instead.
      userCart = await this.cartRepository.findByUserId(userId);
      if (!userCart) {
        return;
      }
    }

    // Compute the final (summed + clamped) quantity for each guest line before
    // touching the database, so the transactional write is a pure data apply.
    const lines: MergeCartLine[] = guestCart.items
      .map((guestItem) => {
        const existing = userCart.items.find((item) => item.productId === guestItem.productId);

        const summed = (existing?.quantity ?? 0) + guestItem.quantity;
        // Clamp to MAX_QUANTITY and the position's available stock.
        const quantity = Math.min(MAX_QUANTITY, summed, guestItem.product.stock);

        return { productId: guestItem.productId, quantity };
      })
      .filter((line) => line.quantity > 0);

    // Apply all lines and delete the guest cart atomically.
    await this.cartRepository.mergeGuestCartIntoUser({
      userCartId: userCart.id,
      guestCartId: guestCart.id,
      lines,
    });
  }

  /**
   * Resolve the existing cart for an identity without creating one.
   * Returns null when no cart exists.
   */
  private resolveCart(identity: ResolvedCartIdentity): Promise<CartWithItems | null> {
    return identity.type === 'user'
      ? this.cartRepository.findByUserId(identity.userId)
      : this.cartRepository.findByToken(identity.token);
  }

  /**
   * Validate an add-to-cart request against the resulting line quantity, BEFORE
   * any DB write. Checks active status, stock availability, and the per-item
   * maximum.
   *
   * @throws BadRequestException if any rule fails
   */
  private validateAddition(
    product: { name: string; stock: number; isActive: boolean },
    resultingQuantity: number,
  ): void {
    // Check if the product position is active
    if (!product.isActive) {
      throw new BadRequestException(`Product "${product.name}" is no longer available`);
    }

    // Check stock availability against the position's stock
    if (resultingQuantity > product.stock) {
      throw new BadRequestException(
        `Requested quantity (${resultingQuantity}) exceeds available stock (${product.stock}) for "${product.name}"`,
      );
    }

    // Check max quantity
    if (resultingQuantity > MAX_QUANTITY) {
      throw new BadRequestException(`Quantity cannot exceed ${MAX_QUANTITY} per item`);
    }
  }
}
