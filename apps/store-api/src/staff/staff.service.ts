import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { StaffRepository, type StaffAccount } from './staff.repository';
import { UserRepository } from '../user/user.repository';
import { AuthRepository } from '../auth/auth.repository';
import { AuthService } from '../auth/auth.service';
import { ReviewService } from '../review/review.service';
import { StaffPermissionsEntity, StaffUserEntity } from './entities';
import { CreateStaffDto, StaffListQueryDto } from './dto';
import { hashPassword } from '../common/security';
import {
  PermissionGrantRepository,
  assertGrantablePermissions,
  assertMayAssign,
  assertMayManage,
  levelOfRole,
  type PermissionActor,
} from '../auth/permissions';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedStaffResponse {
  data: StaffUserEntity[];
  meta: PaginationMeta;
}

/**
 * What {@link StaffService.setPermissions} hands back.
 *
 * The BEFORE-IMAGE is returned rather than left for the caller to fetch, and that
 * is the whole reason this interface exists. The generic `AuditInterceptor` can
 * only ever see the request body — the state the caller ASKED for — so "who
 * quietly gave the manager access to orders?" is unanswerable from it. Reading
 * the old set inside the same operation that replaces it is the only way the two
 * halves of the diff describe the same instant.
 */
export interface StaffPermissionChange {
  entity: StaffPermissionsEntity;
  /** The keys the person held before this write, sorted. */
  before: string[];
  /** The keys they hold now, sorted. */
  after: string[];
  /** Enough of the target to write a readable audit summary. */
  target: { id: string; email: string };
}

/**
 * The «Персонал» section's business logic — and the place the level rule is
 * actually applied (TASK-476, plan 181).
 *
 * FIVE DOORS, ONE RULE. `updateRole`, `setPassword`, `setStatus`, `remove` and —
 * since TASK-477 — `setPermissions` all lead to the same outcome if they are
 * wrong: somebody takes over the shop. Each one therefore resolves the TARGET
 * from the database and then calls `assertMayManage(actor, target)` before
 * touching anything — the same function, with the same argument order, in the
 * same position. Grep for it: five call sites, and a sixth door is visibly
 * missing one.
 *
 * The fifth was added by the task that opened the granting API, and it belongs
 * with the other four for a reason that is easy to miss: handing somebody the set
 * of keys a person ABOVE you holds is a way around the first four rather than a
 * lesser act than them.
 *
 * WHY THE ACTOR COMES FROM THE GUARD, NOT FROM THE JWT. `PermissionActor` is what
 * `PermissionGuard` read from the database on this very request, so `isOwner` and
 * the role are current. Trusting the token instead would mean a demoted admin
 * could still manage managers for up to 15 minutes — the exact window the whole
 * access model exists to close (edge case E-06).
 *
 * WHAT REPLACED `assertNotLastAdmin`. The old guard asked "if I remove this one,
 * is anybody left?" and answered by counting active admins. It could not stop an
 * admin removing the owner as long as a second admin existed, and it needed a
 * count query on every write. The level rule answers a stronger question — "may
 * THIS person act on THAT person?" — and the owner's protection falls out of it:
 * OWNER is the maximum level, `assertMayManage` needs strictly greater, so no
 * caller reaches the owner's account through any of these four methods. The shop
 * cannot be stranded because the one account that can always sign in cannot be
 * demoted, deactivated or deleted at all.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly staffRepository: StaffRepository,
    // The row-lifecycle writes both surfaces share. See StaffRepository's note on
    // why they were not copied here.
    private readonly userRepository: UserRepository,
    private readonly authRepository: AuthRepository,
    private readonly authService: AuthService,
    private readonly reviewService: ReviewService,
    // The one writer of `user_permissions`; see its own docblock for why it lives
    // beside the guard's reader rather than in this module.
    private readonly permissionGrants: PermissionGrantRepository,
  ) {}

  /** One page of staff accounts. */
  async findAll(query: StaffListQueryDto): Promise<PaginatedStaffResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { staff, total } = await this.staffRepository.findAll({
      page,
      limit,
      role: query.role,
      isActive: query.isActive,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      data: staff.map((account) => toEntity(account)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** One staff account. 404 for a customer id — this surface is staff only. */
  async findById(id: string): Promise<StaffUserEntity> {
    return toEntity(await this.requireStaff(id));
  }

  /**
   * Provision a staff account.
   *
   * `assertMayAssign` runs FIRST, before the email lookup. A refusal that had
   * already answered "is this address taken?" would turn a forbidden call into an
   * enumeration oracle — the same reasoning as the profile email guard (TASK-372).
   *
   * @throws ForbiddenException when the caller may not hand out that level
   * @throws ConflictException when the email is already taken
   */
  async create(dto: CreateStaffDto, actor: PermissionActor): Promise<StaffUserEntity> {
    assertMayAssign(actor, levelOfRole(dto.role));

    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already taken');
    }

    const passwordHash = await hashPassword(dto.password);

    const created = await this.staffRepository.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    return StaffUserEntity.fromParts(created, { permissionCount: 0, lastSeenAt: null });
  }

  /**
   * Door 1 — change an account's role.
   *
   * Reads through `UserRepository.findById` rather than the staff-scoped lookup:
   * this is the one route that accepts a CUSTOMER target, because promoting an
   * existing shopper is how most managers are actually hired
   * (`docs/reviews/2026-09-11-access-model.md` §5).
   *
   * BOTH asserts run, and they are not the same question. `assertMayManage` asks
   * whether the caller may touch this person at all; `assertMayAssign` asks
   * whether they may hand out the new level. An admin passes the first against a
   * manager and must still fail the second when the new role is ADMIN — without
   * that second call, "promote my colleague, then have them promote me" is a
   * two-step path to the owner's chair.
   *
   * @throws ForbiddenException on self-targeting, or on a target/level at or above
   *         the caller's own level
   * @throws NotFoundException when the account does not exist
   */
  async updateRole(id: string, role: UserRole, actor: PermissionActor): Promise<StaffUserEntity> {
    // Self-demotion is the single most effective way to lock yourself out, and it
    // is never what somebody means to do. Kept as its own message because "you may
    // only manage levels below your own" reads as a bug when the target is you.
    if (id === actor.id) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const target = await this.userRepository.findById(id);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    assertMayManage(actor, target);
    assertMayAssign(actor, levelOfRole(role));

    if (target.role === role) {
      return this.enrich(target);
    }

    const updated = await this.staffRepository.updateRole(id, role);

    // A demoted employee must not keep a working session. PermissionGuard already
    // re-reads the role on every admin request, so the stale token buys nothing
    // there — revoking is what stops them silently refreshing into a new one.
    await this.authRepository.revokeAllUserTokens(id);

    return this.enrich(updated);
  }

  /**
   * Door 2 — set somebody else's password.
   *
   * Routed through {@link AuthService.setPassword} so an administrator-initiated
   * reset is byte-for-byte the same operation as a self-service one: same hash
   * parameters, same session revocation, same lockout clearing. A second
   * implementation here would be the one that eventually forgets to revoke the old
   * sessions — and "the account may be compromised" is exactly when that matters.
   */
  async setPassword(
    id: string,
    newPassword: string,
    actor: PermissionActor,
  ): Promise<StaffUserEntity> {
    const account = await this.requireStaff(id);
    assertMayManage(actor, account.user);

    await this.authService.setPassword(id, newPassword);

    return toEntity(account);
  }

  /**
   * Door 3 — switch a staff account off or back on.
   *
   * The side effects are deliberately identical to `/api/users/:id/deactivate`
   * (revoke every session, withdraw the account's reviews and ratings — TASK-589)
   * so that banning the same person produces the same result wherever it is done.
   * This task changes who may act, not what the action does.
   */
  async setStatus(id: string, isActive: boolean, actor: PermissionActor): Promise<StaffUserEntity> {
    if (id === actor.id) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const account = await this.requireStaff(id);
    assertMayManage(actor, account.user);

    if (isActive) {
      const activated = await this.userRepository.activate(id);
      await this.reviewService.unhideAuthor(id);
      return toEntity({ ...account, user: activated });
    }

    const deactivated = await this.userRepository.deactivate(id);
    await this.authRepository.revokeAllUserTokens(id);
    await this.reviewService.hideAuthor(id);

    return toEntity({ ...account, user: deactivated });
  }

  /**
   * Door 4 — soft-delete a staff account.
   *
   * Stamps `deletedAt`, sets `isActive = false`, mangles the unique email
   * (`deleted:<id>:`) to free the address for re-registration, preserves the
   * original for audit, and revokes every session. The row survives so the
   * person's historical actions still resolve.
   */
  async remove(id: string, actor: PermissionActor): Promise<void> {
    if (id === actor.id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const account = await this.requireStaff(id);
    assertMayManage(actor, account.user);

    const mangledEmail = `deleted:${account.user.id}:${account.user.email}`;
    await this.userRepository.softDelete(id, mangledEmail, account.user.email);
    await this.authRepository.revokeAllUserTokens(id);
  }

  /**
   * Door 5 (read) — what this person may do, and what they could be given.
   *
   * No level check: `staff:read` already answers "may you look at the staff
   * register at all", and a deputy who can see that an admin exists gains nothing
   * by also seeing that admin holds no rows. The WRITE is where the level rule
   * bites.
   */
  async getPermissions(id: string): Promise<StaffPermissionsEntity> {
    const account = await this.requireStaff(id);
    const permissions = await this.permissionGrants.findByUserId(id);

    return StaffPermissionsEntity.fromParts(account.user, permissions);
  }

  /**
   * Door 5 (write) — replace what this person holds.
   *
   * THIS IS THE ONLY FUNCTION IN THE SYSTEM THAT GRANTS A PERSON ANYTHING.
   * Applying a permission template goes through here too
   * (`PermissionTemplateService.apply`), which is not an accident of layering but
   * the mechanism behind plan 181's invariant 5: a template is reduced to a plain
   * `string[]` before it reaches this line, so nothing downstream can record which
   * template a row came from, and editing that template afterwards therefore
   * cannot move anybody's access. See `permission-template.service.ts` for the
   * full argument, and `copy-rule.spec.ts` for the test that fails if somebody
   * adds the link back.
   *
   * IT IS ALSO THE FIFTH DOOR, in the sense `access-level.ts` means. Granting
   * `products:write` is not "taking over the shop" — but granting somebody the
   * set of keys held by a person ABOVE you is a way around the other four, so the
   * same `assertMayManage(actor, target)` runs here, in the same position, with
   * the same argument order. Grep for it: five call sites now.
   *
   * ORDER OF CHECKS: existence (404), then level (403), then the keys (400). The
   * level refusal must come first — otherwise a deputy who may not touch an
   * admin could still learn from the error messages which keys the catalogue
   * holds, one 400 at a time.
   *
   * @throws NotFoundException for a missing id or a customer's
   * @throws ForbiddenException when the target is at or above the caller's level
   * @throws BadRequestException on an unknown or non-grantable key
   */
  async setPermissions(
    id: string,
    permissions: readonly string[],
    actor: PermissionActor,
  ): Promise<StaffPermissionChange> {
    const account = await this.requireStaff(id);
    assertMayManage(actor, account.user);

    const requested = assertGrantablePermissions(permissions);

    // Read the old set inside the same operation that replaces it: this is the
    // pre-image the audit row needs, and a caller fetching it separately would be
    // recording a different instant.
    const before = await this.permissionGrants.findByUserId(id);
    const after = await this.permissionGrants.replaceForUser(id, requested);

    return {
      entity: StaffPermissionsEntity.fromParts(account.user, after),
      before: [...before].sort(),
      after: [...after].sort(),
      target: { id: account.user.id, email: account.user.email },
    };
  }

  /**
   * The staff-scoped lookup every door except `updateRole` starts from.
   *
   * A customer id and a missing id produce the same 404 on purpose: `staff:read`
   * is a key about service accounts, and answering differently would make this
   * surface a way to probe for shoppers.
   */
  private async requireStaff(id: string): Promise<StaffAccount> {
    const account = await this.staffRepository.findStaffById(id);
    if (!account) {
      throw new NotFoundException('Staff account not found');
    }
    return account;
  }

  /**
   * Attach the counts to a row this service has just written.
   *
   * The lookup can legitimately come back null — demoting somebody to CUSTOMER
   * takes them out of the staff scope — so the row is carried through and only the
   * extras come from the second read.
   */
  private async enrich(user: User): Promise<StaffUserEntity> {
    const account = await this.staffRepository.findStaffById(user.id);
    return account
      ? toEntity({ ...account, user })
      : StaffUserEntity.fromParts(user, { permissionCount: 0, lastSeenAt: null });
  }
}

function toEntity(account: StaffAccount): StaffUserEntity {
  return StaffUserEntity.fromParts(account.user, {
    permissionCount: account.permissionCount,
    lastSeenAt: account.lastSeenAt,
  });
}
