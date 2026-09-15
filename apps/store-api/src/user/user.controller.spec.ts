import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserController } from './user.controller';
import {
  REQUIRE_PERMISSION_KEY,
  OWNER_ONLY_KEY,
} from '../auth/permissions/require-permission.decorator';
import { isGrantablePermission, isKnownPermission } from '../auth/permissions/permission.catalog';

/**
 * What each door of `/api/users` costs (TASK-479, plan 181, invariant 7).
 *
 * `customers:read` used to buy two things that are not the same purchase: the
 * list and the contact details an operator needs in order to phone somebody, AND
 * the full customer card — lifetime value, every order with its total, the text
 * of every review, every redeemed coupon and the full text of every support
 * message (`user-admin-card.entity.ts`). That second thing is the richest pile of
 * personal data in the system, and an order operator does not need it to return a
 * call.
 *
 * So the card moved to its own key and the rest did not. This spec reads the REAL
 * Nest metadata off the REAL controller class rather than grepping the file, so a
 * decorator that is written but not applied — or applied to the handler next door
 * — fails here rather than in production, where the symptom is a manager quietly
 * reading a stranger's purchase history.
 */
describe('UserController — what each route costs (TASK-479)', () => {
  const prototype = UserController.prototype as Record<string, object>;

  const requirementOf = (handler: string): string | undefined =>
    Reflect.getMetadata(REQUIRE_PERMISSION_KEY, prototype[handler]) as string | undefined;

  it('puts the full customer card behind customers:card', () => {
    expect(requirementOf('getAdminCard')).toBe('customers:card');
  });

  it('leaves the list and the contact details under customers:read', () => {
    // The other half of the split, and the half that makes it safe to ship: an
    // operator who could phone a customer yesterday can still phone them today.
    expect(requirementOf('findAll')).toBe('customers:read');
    expect(requirementOf('findById')).toBe('customers:read');
  });

  it('declares customers:card as a real, grantable key', () => {
    // A `@RequirePermission` naming a key the catalogue does not have is a route
    // nobody can reach; a key the granting API refuses is a route only an admin
    // can reach, and the owner cannot fix either from a screen.
    expect(isKnownPermission('customers:card')).toBe(true);
    expect(isGrantablePermission('customers:card')).toBe(true);
  });

  /**
   * The whole permission surface of this controller, pinned.
   *
   * A split that leaves a second door open is worse than no split, because it
   * reads as protection. Listing every route here means adding one is a line in
   * this diff — and the reviewer gets to ask what it returns before it ships
   * under `customers:read`.
   */
  it('has exactly these doors, and no others', () => {
    const doors = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => Reflect.getMetadata(METHOD_METADATA, prototype[name]) !== undefined)
      .map((name) => {
        const ownerOnly = Boolean(Reflect.getMetadata(OWNER_ONLY_KEY, prototype[name]));
        return `${name}: ${ownerOnly ? '@OwnerOnly' : (requirementOf(name) ?? 'authenticated')}`;
      })
      .sort();

    expect(doors).toEqual([
      'activateUser: customers:write',
      'deactivateUser: customers:write',
      'findAll: customers:read',
      'findById: customers:read',
      'getAdminCard: customers:card',
      'getProfile: authenticated',
      'remove: @OwnerOnly',
      'updateProfile: authenticated',
    ]);
  });

  it('is still mounted at /users — the customer surface', () => {
    expect(Reflect.getMetadata(PATH_METADATA, UserController)).toBe('users');
  });
});
