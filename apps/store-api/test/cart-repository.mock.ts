import type { CartRepository } from '../src/cart/cart.repository';

/**
 * Shared, TYPED `CartRepository` double for the unit and e2e suites (TASK-823).
 *
 * WHY TYPED. Before this every suite spelled its own `{ findByUserId: jest.fn(), … }`
 * literal. Nothing tied those literals to the repository, so they drifted with it:
 * two suites still declared `findById` / `findItem` long after the repository lost
 * them, one carried half of the discount repository's methods, and the fixtures the
 * mocks resolved with kept `variantId` / `variant` a year after TASK-142 removed
 * variants from the cart. `jest.fn()` accepts anything, so none of that was ever an
 * error — a fixture could describe a cart the repository cannot return and the suite
 * would still go green, testing a shape production never produces.
 *
 * `Pick<CartRepository, keyof CartRepository>` is every PUBLIC member (the private
 * `prisma` / `logger` are not in `keyof`), and `jest.Mocked` types each one against
 * the real signature — so `mockResolvedValue(...)` only accepts what the method
 * really returns, a method the repository drops is an excess property here, and a
 * method it gains is a missing one.
 *
 * A caveat worth knowing: the spec tsconfigs run ts-jest with `isolatedModules`,
 * which transpiles without type-checking. These types bite in the editor and in an
 * explicit `tsc` over the spec files, not in `jest` itself.
 */
export type CartRepositoryMock = jest.Mocked<Pick<CartRepository, keyof CartRepository>>;

export function createCartRepositoryMock(): CartRepositoryMock {
  return {
    findByUserId: jest.fn(),
    findByToken: jest.fn(),
    findOrCreate: jest.fn(),
    deleteStaleEmptyGuestCarts: jest.fn(),
    assignCartToUser: jest.fn(),
    mergeGuestCartIntoUser: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearItems: jest.fn(),
    findProductForCartValidation: jest.fn(),
    setItemAddon: jest.fn(),
    unsetItemAddon: jest.fn(),
  };
}
