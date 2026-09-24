import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, AddToCartInput, CartWithItems, MergeCartLine } from './cart.repository';
import { CartEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import type { ResolvedCartIdentity } from './cart-identity.types';
import { MAX_QUANTITY } from './cart.constants';
import { AddonApplicabilityResolver } from '../addon-service';
import type { ResolvedAddon } from '../addon-service';

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

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly addonResolver: AddonApplicabilityResolver,
  ) {}

  /**
   * Get the current cart for the identity.
   *
   * A read never writes (TASK-776): when the identity has no cart yet, an empty,
   * UNSAVED cart is returned. The header badge reads the cart on every
   * storefront page, so creating one here left an empty row behind for every
   * visitor and every crawler. The row is created by the first `addToCart`.
   */
  async getCart(identity: ResolvedCartIdentity): Promise<CartEntity> {
    const cart = await this.resolveCart(identity);
    if (!cart) {
      return CartEntity.empty(identity.type === 'user' ? identity.userId : null);
    }
    return this.toEntity(cart);
  }

  /**
   * Select or deselect an add-on service on a cart line (TASK-174).
   *
   * Validate-before-write, mirroring `assertLinePurchasable`: the add-on must be in
   * the line's RESOLVED set (i.e. it comes from the product's category template
   * or an ADD delta, is not REMOVEd, and its catalog row is active) — otherwise a
   * 400, and nothing is persisted. Both directions are idempotent: selecting
   * twice keeps one row, deselecting an unselected add-on is a no-op.
   */
  async toggleAddon(
    identity: ResolvedCartIdentity,
    itemId: string,
    addonServiceId: string,
    selected: boolean,
  ): Promise<CartEntity> {
    const cart = await this.resolveCart(identity);
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = cart.items.find((item) => item.id === itemId);
    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    if (selected) {
      const available = await this.addonResolver.resolveForProduct({
        id: cartItem.product.id,
        categoryId: cartItem.product.categoryId,
      });

      const isApplicable = available.some((addon) => addon.addonServiceId === addonServiceId);
      if (!isApplicable) {
        throw new BadRequestException(
          `Add-on service is not available for "${cartItem.product.name}"`,
        );
      }

      await this.cartRepository.setItemAddon(itemId, addonServiceId);
    } else {
      // Deselecting is always allowed — a selection that is no longer applicable
      // must still be removable (and is already filtered out of every read).
      await this.cartRepository.unsetItemAddon(itemId, addonServiceId);
    }

    return this.getCart(identity);
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
   * semantics — first as a cheap early refusal on the loaded cart, then
   * authoritatively inside the repository's locked write (TASK-779).
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

    this.assertLinePurchasable(product, resultingQuantity);

    const input: AddToCartInput = {
      cartId: cart.id,
      productId: dto.productId,
      quantity: dto.quantity,
    };

    // The check above ran on a read taken outside the write, so a concurrent add
    // can slip past it. The authoritative check runs again INSIDE the locked write
    // transaction, on the fresh line quantity (TASK-779).
    const updated = await this.cartRepository.addItem(input, (fresh, freshQuantity) =>
      this.assertLinePurchasable(fresh, freshQuantity),
    );

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return this.toEntity(updated);
  }

  /**
   * Build the response entity, resolving every line's applicable add-ons in ONE
   * batched pass (TASK-174) — a cart with N lines costs a bounded number of
   * queries, never N (see `AddonApplicabilityResolver.resolveForProducts`).
   */
  private async toEntity(cart: CartWithItems): Promise<CartEntity> {
    const resolved = await this.resolveAddonsFor(cart);
    return CartEntity.fromPrisma(cart, resolved);
  }

  private resolveAddonsFor(cart: CartWithItems): Promise<Map<string, ResolvedAddon[]>> {
    return this.addonResolver.resolveForProducts(
      cart.items.map((item) => ({
        id: item.product.id,
        categoryId: item.product.categoryId,
      })),
    );
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

    this.assertLinePurchasable(cartItem.product, dto.quantity);

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
   * registration. A product in both carts keeps the larger of the two
   * quantities, capped at MAX_QUANTITY (see `mergedQuantity`, TASK-777); stock
   * is not applied during the merge. The guest cart is deleted afterwards. A
   * no-op when the guest cart is missing or empty.
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

    // Resolve the applicable add-ons for every merged product ONCE, so the
    // collision rule below can filter the union without an extra query per line.
    const resolvedAddons = await this.addonResolver.resolveForProducts(
      guestCart.items.map((item) => ({
        id: item.product.id,
        categoryId: item.product.categoryId,
      })),
    );

    // Compute the final quantity for each guest line before touching the
    // database, so the transactional write is a pure data apply.
    const lines: MergeCartLine[] = guestCart.items.map((guestItem) => {
      const existing = userCart.items.find((item) => item.productId === guestItem.productId);

      return {
        productId: guestItem.productId,
        quantity: this.mergedQuantity(existing?.quantity ?? 0, guestItem.quantity),
        addonServiceIds: this.mergeAddonSelections(
          guestItem.addons,
          existing?.addons ?? [],
          resolvedAddons.get(guestItem.product.id) ?? [],
        ),
      };
    });

    // Apply all lines and delete the guest cart atomically.
    await this.cartRepository.mergeGuestCartIntoUser({
      userCartId: userCart.id,
      guestCartId: guestCart.id,
      lines,
    });
  }

  /**
   * Guest→user quantity rule (TASK-777): the merged line keeps the LARGER of the
   * two quantities, capped at MAX_QUANTITY — one rule for every branch.
   *
   * Not the sum: the same item in both carts is usually the same intent recorded
   * twice (added on the phone as a guest, and earlier on the laptop), so summing
   * doubles it. And stock is deliberately NOT applied here: clamping to stock
   * used to turn 10 into 2 on login without a word, while a zero-stock line was
   * skipped and left the user's 10 alone — two rules at once. Stock is checked
   * where it is for any line: the cart read's `maxQty` and the checkout.
   */
  private mergedQuantity(userQuantity: number, guestQuantity: number): number {
    return Math.min(MAX_QUANTITY, Math.max(userQuantity, guestQuantity));
  }

  /**
   * Guest→user add-on collision rule (TASK-174, plan 150 §Risks).
   *
   * When the same product is in BOTH carts, the two lines collapse into one — and
   * so must their add-on selections. The rule is **union, then filter**: an add-on
   * selected in either cart survives the merge (the customer expressed intent for
   * it exactly once; a merge must not silently discard that), and the union is
   * then narrowed to what the resolver still allows for the merged line's
   * product, so a selection that has since become inapplicable (service
   * deactivated, template edited, REMOVE delta added) is dropped rather than
   * carried over blindly.
   */
  private mergeAddonSelections(
    guestSelections: Array<{ addonServiceId: string }>,
    userSelections: Array<{ addonServiceId: string }>,
    available: ResolvedAddon[],
  ): string[] {
    const applicable = new Set(available.map((addon) => addon.addonServiceId));
    const union = new Set([
      ...guestSelections.map((row) => row.addonServiceId),
      ...userSelections.map((row) => row.addonServiceId),
    ]);

    return [...union].filter((addonServiceId) => applicable.has(addonServiceId));
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
   * The one purchasability rule for a cart line (TASK-778), checked against the
   * RESULTING line quantity BEFORE any DB write — by `addToCart` (existing qty +
   * incoming) and by `updateItem` (the new absolute qty) alike. Checks active
   * status (the product's AND its category's), stock availability, and the
   * per-item maximum. Before TASK-778 the update path skipped the active check,
   * so "+" on a withdrawn line answered 200 while an add of it answered 400.
   *
   * @throws BadRequestException if any rule fails
   */
  private assertLinePurchasable(
    product: { name: string; stock: number; isActive: boolean; category: { isActive: boolean } },
    resultingQuantity: number,
  ): void {
    // Deactivating a category WITHDRAWS its products from sale (TASK-297), so it
    // blocks an add exactly as a deactivated position does — and reports the same
    // message, because the distinction ("we pulled the whole category" vs "we
    // pulled this item") is internal and of no use to the shopper.
    if (!product.isActive || !product.category.isActive) {
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
