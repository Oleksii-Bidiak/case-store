import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CartItem, Prisma } from '@prisma/client';

/**
 * Input for adding an item to the cart.
 */
export interface AddToCartInput {
  userId: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

/**
 * Input for updating a cart item's quantity.
 */
export interface UpdateCartItemInput {
  quantity: number;
}

/**
 * Cart with its items and related product/variant details.
 * This is the shape returned by all cart queries — it includes
 * the full item tree so the service can calculate totals.
 */
export interface CartWithItems {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    product: {
      id: string;
      name: string;
      price: { toString(): string };
      compareAtPrice: { toString(): string } | null;
      isActive: boolean;
    };
    variant: {
      id: string;
      name: string;
      price: { toString(): string };
      stock: number;
      isActive: boolean;
    } | null;
  }>;
}

/**
 * Shared Prisma include clause for cart queries.
 * Always fetches items with their product and variant details
 * so the service can calculate totals and validate stock.
 */
const CART_ITEMS_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      productId: true,
      variantId: true,
      quantity: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          compareAtPrice: true,
          isActive: true,
        },
      },
      variant: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          isActive: true,
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
   * Find an existing cart for the user, or create one if it doesn't exist.
   * Uses upsert to avoid race conditions between find and create.
   * Returns the cart with all items.
   */
  findOrCreate(userId: string): Promise<CartWithItems> {
    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: CART_ITEMS_INCLUDE,
    }) as Promise<CartWithItems>;
  }

  /**
   * Add an item to the cart. If the same product+variant combination
   * already exists in the cart, increment the quantity instead of
   * creating a duplicate (upsert pattern).
   *
   * Uses a Prisma transaction to ensure atomicity:
   * 1. Find or create the cart
   * 2. Upsert the cart item
   * 3. Return the full updated cart
   */
  async addItem(input: AddToCartInput): Promise<CartWithItems> {
    const { userId, productId, variantId, quantity } = input;

    return this.prisma.$transaction(async (tx) => {
      // 1. Ensure cart exists
      const cart = await tx.cart.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });

      // 2. Upsert the cart item — increment quantity if it already exists
      await tx.cartItem.upsert({
        where: {
          cartId_productId_variantId: {
            cartId: cart.id,
            productId,
            variantId: (variantId ?? null) as string,
          },
        },
        update: {
          quantity: { increment: quantity },
        },
        create: {
          cartId: cart.id,
          productId,
          variantId: variantId ?? null,
          quantity,
        },
      });

      // 3. Return the full cart with items
      const result = await tx.cart.findUnique({
        where: { id: cart.id },
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
   * Find a specific cart item by cart ID, product ID, and optional variant ID.
   * Used by the service to check if an item already exists before adding.
   * Returns null if the item is not found.
   */
  findItem(cartId: string, productId: string, variantId?: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantId: {
          cartId,
          productId,
          variantId: (variantId ?? null) as string,
        },
      },
    });
  }
}
