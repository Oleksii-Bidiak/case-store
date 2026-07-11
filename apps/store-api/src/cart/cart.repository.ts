import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CartItem, Prisma } from '@prisma/client';
import type { ResolvedCartIdentity } from './cart-identity.types';

/**
 * Input for adding an item to a specific cart.
 * The owning cart is resolved by the service before calling the repository.
 */
export interface AddToCartInput {
  cartId: string;
  productId: string;
  quantity: number;
}

/**
 * Input for updating a cart item's quantity.
 */
export interface UpdateCartItemInput {
  quantity: number;
}

/**
 * A single already-clamped line to write into the user's cart during a merge.
 * The quantity is absolute (final) — the service has summed and clamped it
 * against stock / MAX_QUANTITY before handing it to the repository.
 */
export interface MergeCartLine {
  productId: string;
  quantity: number;
  /**
   * The FINAL add-on selection for the merged line (TASK-174) — the union of the
   * guest's and the user's selections for this product, already filtered through
   * the resolver by the service. Written as a full set-replace, so an add-on the
   * resolver no longer allows is dropped rather than carried over blindly.
   */
  addonServiceIds: string[];
}

/**
 * Cart with its items and related product (position) details.
 * This is the shape returned by all cart queries — it includes
 * the full item tree so the service can calculate totals and validate stock.
 * Since TASK-142 each cart line references a product position directly; stock
 * and price live on the product.
 */
export interface CartWithItems {
  id: string;
  userId: string | null;
  token: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    /** Add-on services selected on this line (TASK-174). */
    addons: Array<{ addonServiceId: string }>;
    product: {
      id: string;
      name: string;
      slug: string;
      price: { toString(): string };
      compareAtPrice: { toString(): string } | null;
      stock: number;
      isActive: boolean;
      /** Drives add-on template resolution (TASK-174). */
      categoryId: string;
      images: Array<{ url: string }>;
    };
  }>;
}

/**
 * Shared Prisma include clause for cart queries.
 * Always fetches items with their product (position) details so the service can
 * calculate totals and validate stock. Also selects the product `slug` and its
 * primary `images` entry (isPrimary-first, then sortOrder; `take: 1`) so each
 * cart line can render a thumbnail and link to the PDP without an extra query.
 */
const CART_ITEMS_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      productId: true,
      quantity: true,
      createdAt: true,
      updatedAt: true,
      // Selected add-ons per line (TASK-174) — pulled in the SAME query as the
      // product/images include, never as a follow-up round trip. The AVAILABLE
      // add-ons are computed, not stored, so they come from the resolver instead.
      addons: { select: { addonServiceId: true } },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          stock: true,
          isActive: true,
          // The resolver walks this category's ancestor chain for the line's
          // applicable add-on template (TASK-174).
          categoryId: true,
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartRepository {
  private readonly logger = new Logger(CartRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a cart by user ID, including all items with product/variant details.
   * Returns null if the user has no cart.
   */
  findByUserId(userId: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: CART_ITEMS_INCLUDE,
    }) as Promise<CartWithItems | null>;
  }

  /**
   * Find a guest cart by its opaque token, including all items.
   * Returns null if no cart exists for the token.
   */
  findByToken(token: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findUnique({
      where: { token },
      include: CART_ITEMS_INCLUDE,
    }) as Promise<CartWithItems | null>;
  }

  /**
   * Find a cart by its ID, including all items with product/variant details.
   * Returns null if the cart does not exist.
   */
  findById(cartId: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findUnique({
      where: { id: cartId },
      include: CART_ITEMS_INCLUDE,
    }) as Promise<CartWithItems | null>;
  }

  /**
   * Find an existing cart for the given identity, or create one if it doesn't
   * exist. A user identity upserts by `userId`; a token identity upserts by
   * `token`. Uses upsert to avoid race conditions between find and create.
   */
  findOrCreate(identity: ResolvedCartIdentity): Promise<CartWithItems> {
    const where =
      identity.type === 'user' ? { userId: identity.userId } : { token: identity.token };
    const create =
      identity.type === 'user' ? { userId: identity.userId } : { token: identity.token };

    return this.prisma.cart.upsert({
      where,
      update: {},
      create,
      include: CART_ITEMS_INCLUDE,
    }) as Promise<CartWithItems>;
  }

  /**
   * Assign a (guest) cart to a user, clearing its guest token. Used during
   * merge when the user has no pre-existing cart.
   *
   * Returns `false` when the user already owns a cart — a concurrent request
   * created one between the caller's lookup and this update (e.g. multi-tab
   * login), so the `userId` unique constraint is violated (Prisma P2002). The
   * caller should then fall back to the item-by-item merge path instead.
   */
  async assignCartToUser(cartId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.cart.update({
        where: { id: cartId },
        data: { userId, token: null },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Atomically merge a set of already-clamped lines into the user's cart and
   * delete the guest cart, in a single transaction. Either every line is
   * written and the guest cart removed, or nothing changes — there is no
   * partially-merged state and no orphaned guest cart left behind on failure.
   *
   * Quantities are absolute: the service has already summed the guest and user
   * quantities and clamped them against stock / MAX_QUANTITY.
   */
  async mergeGuestCartIntoUser(params: {
    userCartId: string;
    guestCartId: string;
    lines: MergeCartLine[];
  }): Promise<void> {
    const { userCartId, guestCartId, lines } = params;

    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const cartItem = await this.writeCartLine(
          tx,
          userCartId,
          line.productId,
          line.quantity,
          'set',
        );
        await this.replaceItemAddons(tx, cartItem.id, line.addonServiceIds);
      }

      // Cascades to the guest cart's CartItems via the schema relation — and, in
      // turn, to their CartItemAddon rows.
      await tx.cart.delete({ where: { id: guestCartId } });
    });
  }

  /**
   * Set a merged line's add-on selection to exactly `addonServiceIds` (TASK-174).
   * Runs inside the merge transaction so a line and its add-ons can never land
   * half-written.
   */
  private async replaceItemAddons(
    tx: Prisma.TransactionClient,
    cartItemId: string,
    addonServiceIds: string[],
  ): Promise<void> {
    await tx.cartItemAddon.deleteMany({
      where: { cartItemId, addonServiceId: { notIn: addonServiceIds } },
    });

    for (const addonServiceId of addonServiceIds) {
      await tx.cartItemAddon.upsert({
        where: { cartItemId_addonServiceId: { cartItemId, addonServiceId } },
        update: {},
        create: { cartItemId, addonServiceId },
      });
    }
  }

  /**
   * Upsert a single cart line by (cartId, productId) using the compound unique
   * `cartId_productId`. Since TASK-142 a cart line maps to a product position,
   * so there is no nullable variant to special-case.
   *
   * `mode: 'increment'` adds to the existing quantity (add-to-cart); `mode:
   * 'set'` writes the absolute quantity (merge, where the service pre-clamps).
   */
  private writeCartLine(
    tx: Prisma.TransactionClient,
    cartId: string,
    productId: string,
    quantity: number,
    mode: 'increment' | 'set',
  ): Promise<CartItem> {
    return tx.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      update: { quantity: mode === 'increment' ? { increment: quantity } : quantity },
      create: { cartId, productId, quantity },
    });
  }

  /**
   * Add an item to a specific cart. If the same product position already exists,
   * increment the quantity instead of creating a duplicate. Returns the full
   * updated cart with items.
   */
  async addItem(input: AddToCartInput): Promise<CartWithItems> {
    const { cartId, productId, quantity } = input;

    return this.prisma.$transaction(async (tx) => {
      // Add the line, incrementing the quantity if the same product already
      // exists in this cart.
      await this.writeCartLine(tx, cartId, productId, quantity, 'increment');

      // Return the full cart with items
      const result = await tx.cart.findUnique({
        where: { id: cartId },
        include: CART_ITEMS_INCLUDE,
      });

      return result as CartWithItems;
    });
  }

  /**
   * Update a cart item's quantity.
   * Returns the updated cart item record.
   */
  updateItem(itemId: string, input: UpdateCartItemInput): Promise<CartItem> {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: input.quantity },
    });
  }

  /**
   * Remove a cart item by its ID.
   */
  async removeItem(itemId: string): Promise<void> {
    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });
  }

  /**
   * Remove all items from a cart.
   */
  async clearItems(cartId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  /**
   * Find a specific cart item by cart ID and product (position) ID.
   * Used by the service to check if an item already exists before adding.
   * Returns null if the item is not found.
   */
  findItem(cartId: string, productId: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
    });
  }

  /**
   * Fetch the fields needed to validate an add-to-cart request for a product
   * that is not yet present in the cart. Returns null when the product does
   * not exist.
   *
   * Cart-internal use only — `CartService` calls this to validate stock /
   * `isActive` / max-quantity BEFORE writing a new cart line. It is NOT a
   * general product-access API and must not grow into one; the cart already
   * reads these product columns via `CART_ITEMS_INCLUDE` for existing lines.
   */
  findProductForCartValidation(
    productId: string,
  ): Promise<{ id: string; name: string; stock: number; isActive: boolean } | null> {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stock: true, isActive: true },
    });
  }

  /**
   * Select an add-on service on a cart line (TASK-174). Idempotent — selecting an
   * already-selected add-on rewrites the same row rather than duplicating it
   * (`@@unique([cartItemId, addonServiceId])`). No price is stored: a cart is a
   * shopping list, and the effective price is resolved live on every read.
   */
  async setItemAddon(cartItemId: string, addonServiceId: string): Promise<void> {
    await this.prisma.cartItemAddon.upsert({
      where: { cartItemId_addonServiceId: { cartItemId, addonServiceId } },
      update: {},
      create: { cartItemId, addonServiceId },
    });
  }

  /**
   * Deselect an add-on service on a cart line (TASK-174). Idempotent —
   * deselecting one that was never selected is a no-op, not an error.
   */
  async unsetItemAddon(cartItemId: string, addonServiceId: string): Promise<void> {
    await this.prisma.cartItemAddon.deleteMany({ where: { cartItemId, addonServiceId } });
  }
}
