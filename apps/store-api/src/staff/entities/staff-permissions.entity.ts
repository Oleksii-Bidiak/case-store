import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  AccessLevel,
  GRANTABLE_PERMISSIONS,
  PERMISSION_ZONE_LABELS,
  levelOf,
} from '../../auth/permissions';

/** One permission as the granting screen renders it. */
export class GrantablePermissionEntry {
  @ApiProperty({ example: 'orders:read' }) key!: string;
  @ApiProperty({ example: 'orders' }) zone!: string;
  @ApiProperty({ example: 'Переглядати замовлення' }) label!: string;
}

/** A zone heading, in display order. */
export class PermissionZoneEntry {
  @ApiProperty({ example: 'orders' }) zone!: string;
  @ApiProperty({ example: 'Замовлення' }) label!: string;
}

/**
 * What one person may do, and what they COULD be given (TASK-477, plan 181).
 *
 * ── WHY THE CATALOGUE TRAVELS WITH THE ANSWER ────────────────────────────────
 *
 * The screen this feeds is a grid of checkboxes, and it needs two things: which
 * boxes exist and which are ticked. Returning them together is the same call the
 * retired matrix endpoint made, for the same reason — a new admin section appears
 * on the granting screen simply by being declared in `permission.catalog.ts`, with
 * no second endpoint to remember and no frontend copy of the key list to drift.
 *
 * The catalogue here is `GRANTABLE_PERMISSIONS`, never `PERMISSIONS`. That is the
 * UI half of what makes `staff:read` / `staff:write` / `audit:read` ungrantable
 * "by construction": there is no screen on which the wrong box can be ticked,
 * because the wrong box is never rendered. The API half is
 * `assertGrantablePermissions`, which refuses them even when nothing rendered
 * them.
 *
 * ── WHY `holdsEverythingByLevel` EXISTS ──────────────────────────────────────
 *
 * An owner or a deputy admin passes every permission WITHOUT a single row
 * (`PermissionGuard` steps 5 and 7). So for those two, `permissions` below is
 * not what they can do — it is very often an empty array. A screen that rendered
 * that grid unqualified would tell the owner their deputy can do nothing, which
 * is the exact opposite of the truth. The flag is computed server-side from the
 * same `levelOf()` the rule uses, so the UI never re-derives "who outranks whom".
 *
 * Rows can still be stored on such an account, and they are not a lie: they are
 * simply not consulted while the person holds that level. They begin to matter
 * the moment the person is demoted to MANAGER — which is also why demotion is a
 * deliberate act at a different door.
 */
export class StaffPermissionsEntity {
  @ApiProperty({ description: 'The account these permissions belong to' })
  userId!: string;

  @ApiProperty({ description: 'Email address, so the screen can title itself' })
  email!: string;

  @ApiProperty({ description: 'Account role', enum: UserRole, example: UserRole.MANAGER })
  role!: UserRole;

  @ApiProperty({
    description: 'Access level: 3 owner, 2 admin, 1 manager, 0 customer',
    example: 1,
  })
  level!: AccessLevel;

  @ApiProperty({
    description:
      'True for the owner and for deputy admins: they hold every permission by level, so the ' +
      'rows below are not what they can do.',
    example: false,
  })
  holdsEverythingByLevel!: boolean;

  @ApiProperty({
    description: 'The keys granted to this person personally, sorted',
    type: [String],
    example: ['orders:read', 'orders:write'],
  })
  permissions!: string[];

  @ApiProperty({
    description: 'Every permission that MAY be granted, with its zone and Ukrainian label',
    type: [GrantablePermissionEntry],
  })
  catalogue!: GrantablePermissionEntry[];

  @ApiProperty({
    description: 'Zone display order and headings',
    type: [PermissionZoneEntry],
  })
  zones!: PermissionZoneEntry[];

  static fromParts(
    user: { id: string; email: string; role: UserRole; isOwner: boolean },
    permissions: readonly string[],
  ): StaffPermissionsEntity {
    const entity = new StaffPermissionsEntity();
    entity.userId = user.id;
    entity.email = user.email;
    entity.role = user.role;
    entity.level = levelOf(user);
    entity.holdsEverythingByLevel = entity.level >= AccessLevel.ADMIN;
    entity.permissions = [...permissions].sort();
    entity.catalogue = GRANTABLE_PERMISSIONS.map((permission) => ({
      key: permission.key,
      zone: permission.zone,
      label: permission.label,
    }));
    // Only zones that still contain something grantable. Otherwise «Персонал і
    // журнал дій» arrives as a heading with nothing under it — a screen inviting
    // the owner to look for a tick that does not exist, which reads as a bug and
    // is the opposite of what non-grantable is meant to communicate.
    const offered = new Set(entity.catalogue.map((permission) => permission.zone));
    entity.zones = PERMISSION_ZONE_LABELS.filter((zone) => offered.has(zone.zone)).map((zone) => ({
      zone: zone.zone,
      label: zone.label,
    }));
    return entity;
  }
}
