import { UserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { AccessLevel, levelOf } from '../../auth/permissions';

/**
 * A staff account as the «Персонал» screen needs it (TASK-476, plan 181).
 *
 * WHY NOT JUST `UserEntity`. Three fields decide what the screen can show and
 * none of them belong on the customer entity:
 *
 *   - `isOwner` / `level` — the whole point of the section. Without the level the
 *     UI would have to re-derive "who outranks whom" in TypeScript, which is the
 *     duplication `access-level.ts` exists to prevent; the number here IS
 *     `levelOf()`, computed server-side once.
 *   - `permissionCount` — «скільки прав» from decision 3. An owner scanning the
 *     list wants to see at a glance that the new hire has 4 permissions and the
 *     departing one still has 31.
 *   - `lastSeenAt` — see the field's own note. Honest about what it measures.
 *
 * Sensitive fields (`passwordHash`, tokens) are excluded by construction: this
 * entity is assembled field by field from the row, never spread from it.
 */
export class StaffUserEntity {
  @ApiProperty({ description: 'Account id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Email address (also the login)', example: 'manager@example.com' })
  email!: string;

  @ApiProperty({ description: 'First name', nullable: true, type: String })
  firstName!: string | null;

  @ApiProperty({ description: 'Last name', nullable: true, type: String })
  lastName!: string | null;

  @ApiProperty({ description: 'Phone number', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ description: 'Account role', enum: UserRole, example: UserRole.MANAGER })
  role!: UserRole;

  @ApiProperty({
    description: 'True for the ONE account that owns the shop. Nobody may act on it.',
    example: false,
  })
  isOwner!: boolean;

  @ApiProperty({
    description:
      'Access level: 3 owner, 2 admin, 1 manager, 0 customer. Manage only levels below your own.',
    example: 1,
  })
  level!: AccessLevel;

  @ApiProperty({ description: 'Whether the account may sign in', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'How many permissions are granted to this person personally',
    example: 7,
  })
  permissionCount!: number;

  /**
   * When this account last held a live session — the newest `RefreshToken` row.
   *
   * NOT called `lastLoginAt`, because it is not one: a token is minted at sign-in
   * AND on every rotation, so this moves while somebody keeps a tab open. There is
   * no login timestamp on `User` and TASK-476 is not the task that adds a column;
   * naming the field for what it actually measures costs nothing and stops the
   * admin UI from asserting something the data cannot support.
   */
  @ApiProperty({
    description: 'When this account last held a live session; null if never',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastSeenAt!: string | null;

  @ApiProperty({
    description: 'When the email address was verified; null if never',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  emailVerifiedAt!: string | null;

  @ApiProperty({
    description: 'Locked out until this instant; null when not locked',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lockedUntil!: string | null;

  @ApiProperty({ description: 'Consecutive failed login attempts', example: 0 })
  failedLoginAttempts!: number;

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;

  static fromParts(
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      role: UserRole;
      isOwner: boolean;
      isActive: boolean;
      emailVerifiedAt?: Date | null;
      lockedUntil?: Date | null;
      failedLoginAttempts?: number;
      createdAt: Date;
      updatedAt: Date;
    },
    extras: { permissionCount: number; lastSeenAt: Date | null } = {
      permissionCount: 0,
      lastSeenAt: null,
    },
  ): StaffUserEntity {
    const entity = new StaffUserEntity();
    entity.id = user.id;
    entity.email = user.email;
    entity.firstName = user.firstName;
    entity.lastName = user.lastName;
    entity.phone = user.phone;
    entity.role = user.role;
    entity.isOwner = user.isOwner;
    entity.level = levelOf(user);
    entity.isActive = user.isActive;
    entity.permissionCount = extras.permissionCount;
    entity.lastSeenAt = extras.lastSeenAt ? extras.lastSeenAt.toISOString() : null;
    entity.emailVerifiedAt = user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null;
    entity.lockedUntil = user.lockedUntil ? user.lockedUntil.toISOString() : null;
    entity.failedLoginAttempts = user.failedLoginAttempts ?? 0;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;
    return entity;
  }
}
