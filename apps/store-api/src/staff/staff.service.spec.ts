import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service';
import { StaffRepository } from './staff.repository';
import { UserRepository } from '../user/user.repository';
import { AuthRepository } from '../auth/auth.repository';
import { AuthService } from '../auth/auth.service';
import { ReviewService } from '../review/review.service';
import { PermissionGrantRepository } from '../auth/permissions';
import type { PermissionActor } from '../auth/permissions';

/**
 * The four doors, proved door by door (TASK-476, plan 181, invariants 2 and 3).
 *
 * `access-level.spec.ts` proves the RULE; this file proves that each of the four
 * doors actually calls it — which is the half that drifted last time. Every
 * describe below therefore repeats the same three questions against a different
 * door: may a deputy do this to a manager (yes), to another admin (no), to the
 * owner (no)?
 */

// ─── People ───────────────────────────────────────────────────────────────────

const ownerActor: PermissionActor = {
  id: 'owner-1',
  email: 'owner@example.com',
  role: UserRole.ADMIN,
  isOwner: true,
  permissions: new Set<string>(),
};

const deputyActor: PermissionActor = {
  id: 'deputy-1',
  email: 'deputy@example.com',
  role: UserRole.ADMIN,
  isOwner: false,
  permissions: new Set<string>(),
};

const baseRow = {
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
  firstName: 'Olena',
  lastName: 'Kovalenko',
  phone: null,
  isActive: true,
  emailVerifiedAt: null,
  lockedUntil: null,
  failedLoginAttempts: 0,
  originalEmail: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const ownerRow = {
  ...baseRow,
  id: 'owner-1',
  email: 'owner@example.com',
  role: UserRole.ADMIN,
  isOwner: true,
};
const otherAdminRow = {
  ...baseRow,
  id: 'admin-2',
  email: 'admin2@example.com',
  role: UserRole.ADMIN,
  isOwner: false,
};
const managerRow = {
  ...baseRow,
  id: 'manager-1',
  email: 'manager@example.com',
  role: UserRole.MANAGER,
  isOwner: false,
};
const customerRow = {
  ...baseRow,
  id: 'customer-1',
  email: 'shopper@example.com',
  role: UserRole.CUSTOMER,
  isOwner: false,
};

const staffAccount = (user: typeof managerRow) => ({
  user,
  permissionCount: 3,
  lastSeenAt: new Date('2026-02-01T00:00:00.000Z'),
});

// ─── Doubles ──────────────────────────────────────────────────────────────────

const staffRepositoryMock = {
  findAll: jest.fn(),
  findStaffById: jest.fn(),
  create: jest.fn(),
  updateRole: jest.fn(),
  transferOwnership: jest.fn(),
};

const userRepositoryMock = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  softDelete: jest.fn(),
};

const authRepositoryMock = { revokeAllUserTokens: jest.fn() };
const authServiceMock = {
  setPassword: jest.fn(),
  verifyOwnPassword: jest.fn().mockResolvedValue(undefined),
};
const reviewServiceMock = { hideAuthor: jest.fn(), unhideAuthor: jest.fn() };
const permissionGrantRepositoryMock = {
  findByUserId: jest.fn().mockResolvedValue([]),
  replaceForUser: jest.fn(),
};

describe('StaffService', () => {
  let service: StaffService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: StaffRepository, useValue: staffRepositoryMock },
        { provide: UserRepository, useValue: userRepositoryMock },
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ReviewService, useValue: reviewServiceMock },
        { provide: PermissionGrantRepository, useValue: permissionGrantRepositoryMock },
      ],
    }).compile();

    service = module.get(StaffService);
  });

  // ─── Door 0: reading the staff list ─────────────────────────────────────────

  describe('findById', () => {
    it('returns a staff account with its level, permission count and last activity', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      const staff = await service.findById(managerRow.id);

      expect(staff.id).toBe(managerRow.id);
      expect(staff.role).toBe(UserRole.MANAGER);
      expect(staff.isOwner).toBe(false);
      expect(staff.level).toBe(1);
      expect(staff.permissionCount).toBe(3);
      expect(staff).not.toHaveProperty('passwordHash');
    });

    it('is 404 for a customer id — this surface is staff only', async () => {
      // The repository scopes to ADMIN|MANAGER, so a shopper simply is not here.
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(service.findById(customerRow.id)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Door 1: creating an account ────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      email: 'new@example.com',
      password: 'StrongP@ss123',
      role: UserRole.MANAGER as typeof UserRole.ADMIN | typeof UserRole.MANAGER,
    };

    it('lets an admin create a MANAGER, hashing the password before the repository sees it', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      staffRepositoryMock.create.mockResolvedValue({ ...managerRow, email: dto.email });

      await service.create(dto, deputyActor);

      const input = staffRepositoryMock.create.mock.calls[0][0] as { passwordHash: string };
      expect(input.passwordHash).toMatch(/^\$argon2id\$/);
      expect(input).not.toHaveProperty('password');
    });

    it('refuses an admin creating another ADMIN — nobody assigns their own level', async () => {
      await expect(service.create({ ...dto, role: UserRole.ADMIN }, deputyActor)).rejects.toThrow(
        ForbiddenException,
      );

      // Refused BEFORE the email lookup: a forbidden call must not double as an
      // address-enumeration oracle.
      expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
      expect(staffRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('lets the OWNER create an ADMIN — appointing a deputy is the reserve', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      staffRepositoryMock.create.mockResolvedValue({ ...otherAdminRow, email: dto.email });

      await expect(service.create({ ...dto, role: UserRole.ADMIN }, ownerActor)).resolves.toEqual(
        expect.objectContaining({ role: UserRole.ADMIN }),
      );
    });

    it('refuses an email that is already taken', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(managerRow);

      await expect(service.create(dto, ownerActor)).rejects.toThrow(ConflictException);
      expect(staffRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  // ─── Door 2: changing a role ────────────────────────────────────────────────

  describe('updateRole', () => {
    it('refuses the caller their own account outright', async () => {
      await expect(
        service.updateRole(deputyActor.id, UserRole.MANAGER, deputyActor),
      ).rejects.toThrow('Cannot change your own role');
      expect(userRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('lets an admin demote a manager and revokes every session they held', async () => {
      userRepositoryMock.findById.mockResolvedValue(managerRow);
      staffRepositoryMock.updateRole.mockResolvedValue({
        ...managerRow,
        role: UserRole.CUSTOMER,
      });
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await service.updateRole(managerRow.id, UserRole.CUSTOMER, deputyActor);

      expect(staffRepositoryMock.updateRole).toHaveBeenCalledWith(managerRow.id, UserRole.CUSTOMER);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(managerRow.id);
    });

    it('PROMOTES an existing customer — the flow the review called out (§5)', async () => {
      userRepositoryMock.findById.mockResolvedValue(customerRow);
      staffRepositoryMock.updateRole.mockResolvedValue({
        ...customerRow,
        role: UserRole.MANAGER,
      });
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      const staff = await service.updateRole(customerRow.id, UserRole.MANAGER, deputyActor);

      expect(staff.role).toBe(UserRole.MANAGER);
    });

    it('refuses an admin changing ANOTHER ADMIN’s role', async () => {
      userRepositoryMock.findById.mockResolvedValue(otherAdminRow);

      await expect(
        service.updateRole(otherAdminRow.id, UserRole.MANAGER, deputyActor),
      ).rejects.toThrow(ForbiddenException);
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('refuses an admin demoting the OWNER', async () => {
      userRepositoryMock.findById.mockResolvedValue(ownerRow);

      await expect(service.updateRole(ownerRow.id, UserRole.MANAGER, deputyActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('refuses the OWNER demoting the owner — invariant 2, even from their own hand', async () => {
      // An owner who could demote themselves via a second owner account, a script
      // or a mistyped id would leave the shop with nobody at level 3.
      userRepositoryMock.findById.mockResolvedValue(ownerRow);

      await expect(
        service.updateRole(ownerRow.id, UserRole.MANAGER, { ...ownerActor, id: 'someone-else' }),
      ).rejects.toThrow(ForbiddenException);
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('refuses an admin PROMOTING anybody to ADMIN', async () => {
      // `assertMayManage` passes here (admin over manager) and the operation is
      // still forbidden, which is exactly why the two asserts are separate.
      userRepositoryMock.findById.mockResolvedValue(managerRow);

      await expect(service.updateRole(managerRow.id, UserRole.ADMIN, deputyActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('lets the OWNER promote a manager to ADMIN', async () => {
      userRepositoryMock.findById.mockResolvedValue(managerRow);
      staffRepositoryMock.updateRole.mockResolvedValue({ ...managerRow, role: UserRole.ADMIN });
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      const staff = await service.updateRole(managerRow.id, UserRole.ADMIN, ownerActor);

      expect(staff.role).toBe(UserRole.ADMIN);
    });

    it('is 404 for an account that does not exist', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.updateRole('ghost', UserRole.MANAGER, ownerActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Door 3: setting somebody's password ────────────────────────────────────

  describe('setPassword', () => {
    it('lets an admin reset a manager’s password through the self-service path', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      await service.setPassword(managerRow.id, 'StrongP@ss123', deputyActor);

      // Routed through AuthService so the reset revokes sessions and clears the
      // lockout exactly as a self-service change does.
      expect(authServiceMock.setPassword).toHaveBeenCalledWith(managerRow.id, 'StrongP@ss123');
    });

    it('refuses an admin resetting ANOTHER ADMIN’s password — that is signing in as them', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));

      await expect(
        service.setPassword(otherAdminRow.id, 'StrongP@ss123', deputyActor),
      ).rejects.toThrow(ForbiddenException);
      expect(authServiceMock.setPassword).not.toHaveBeenCalled();
    });

    it('refuses ANYBODY resetting the OWNER’s password', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(ownerRow));

      for (const actor of [deputyActor, { ...ownerActor, id: 'another-owner' }]) {
        await expect(service.setPassword(ownerRow.id, 'StrongP@ss123', actor)).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(authServiceMock.setPassword).not.toHaveBeenCalled();
    });

    it('is 404 for a customer id', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(
        service.setPassword(customerRow.id, 'StrongP@ss123', ownerActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Door 4: deactivating an account ────────────────────────────────────────

  describe('setStatus', () => {
    it('refuses the caller their own account', async () => {
      await expect(service.setStatus(deputyActor.id, false, deputyActor)).rejects.toThrow(
        'Cannot deactivate your own account',
      );
      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
    });

    it('lets an admin deactivate a manager, revoking sessions and withdrawing their texts', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      userRepositoryMock.deactivate.mockResolvedValue({ ...managerRow, isActive: false });

      const staff = await service.setStatus(managerRow.id, false, deputyActor);

      expect(staff.isActive).toBe(false);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(managerRow.id);
      expect(reviewServiceMock.hideAuthor).toHaveBeenCalledWith(managerRow.id);
    });

    it('refuses an admin deactivating ANOTHER ADMIN', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));

      await expect(service.setStatus(otherAdminRow.id, false, deputyActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
    });

    it('refuses ANYBODY deactivating the OWNER — invariant 2', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(ownerRow));

      for (const actor of [deputyActor, { ...ownerActor, id: 'another-owner' }]) {
        await expect(service.setStatus(ownerRow.id, false, actor)).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
    });

    it('restores a manager and gives their texts back', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue({
        ...staffAccount(managerRow),
        user: { ...managerRow, isActive: false },
      });
      userRepositoryMock.activate.mockResolvedValue({ ...managerRow, isActive: true });

      const staff = await service.setStatus(managerRow.id, true, deputyActor);

      expect(staff.isActive).toBe(true);
      expect(reviewServiceMock.unhideAuthor).toHaveBeenCalledWith(managerRow.id);
    });

    it('is 404 for a customer id — shoppers are switched off on /api/users', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(service.setStatus(customerRow.id, false, ownerActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Door 5: deleting an account ────────────────────────────────────────────

  describe('remove', () => {
    it('refuses the caller their own account', async () => {
      await expect(service.remove(deputyActor.id, deputyActor)).rejects.toThrow(
        'Cannot delete your own account',
      );
      expect(userRepositoryMock.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes a manager with a mangled email and revokes their sessions', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      userRepositoryMock.softDelete.mockResolvedValue({
        ...managerRow,
        deletedAt: new Date(),
        isActive: false,
      });

      await service.remove(managerRow.id, deputyActor);

      expect(userRepositoryMock.softDelete).toHaveBeenCalledWith(
        managerRow.id,
        `deleted:${managerRow.id}:${managerRow.email}`,
        managerRow.email,
      );
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(managerRow.id);
    });

    it('refuses an admin deleting ANOTHER ADMIN', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));

      await expect(service.remove(otherAdminRow.id, deputyActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userRepositoryMock.softDelete).not.toHaveBeenCalled();
    });

    it('refuses ANYBODY deleting the OWNER — invariant 2', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(ownerRow));

      for (const actor of [deputyActor, { ...ownerActor, id: 'another-owner' }]) {
        await expect(service.remove(ownerRow.id, actor)).rejects.toThrow(ForbiddenException);
      }
      expect(userRepositoryMock.softDelete).not.toHaveBeenCalled();
    });

    it('is 404 for a customer id', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(service.remove(customerRow.id, ownerActor)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── The list ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('pages the staff list and reports each row’s level', async () => {
      staffRepositoryMock.findAll.mockResolvedValue({
        staff: [staffAccount(managerRow), { ...staffAccount(ownerRow), permissionCount: 0 }],
        total: 2,
      });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(result.data.map((row) => row.level)).toEqual([1, 3]);
      expect(result.data[1].isOwner).toBe(true);
    });
  });

  // ─── Door 5: the permissions a person holds (TASK-477) ──────────────────────
  //
  // A fifth door in the sense `access-level.ts` means it: granting somebody
  // `products:write` is not "taking over the shop", but granting them the set of
  // keys somebody ABOVE you holds is a way to work around the other four. So the
  // write here calls `assertMayManage` exactly like the rest, and the assertions
  // below are the same three questions asked of a different verb.

  describe('getPermissions', () => {
    it('returns the person’s own rows plus the grantable catalogue to render', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue([
        'products:write',
        'orders:read',
      ]);

      const result = await service.getPermissions(managerRow.id);

      expect(result.userId).toBe(managerRow.id);
      expect(result.permissions).toEqual(['orders:read', 'products:write']);
      expect(result.catalogue.length).toBeGreaterThan(20);
      expect(result.zones.length).toBeGreaterThan(5);
      expect(result.holdsEverythingByLevel).toBe(false);
    });

    it('never offers a non-grantable key in the catalogue it hands the screen', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue([]);

      const result = await service.getPermissions(managerRow.id);
      const offered = result.catalogue.map((entry) => entry.key);

      expect(offered).not.toContain('staff:read');
      expect(offered).not.toContain('staff:write');
      expect(offered).not.toContain('audit:read');
    });

    it('says outright that an admin holds everything by level, rows or no rows', async () => {
      // Otherwise the screen renders an empty checkbox grid for a deputy and
      // implies they can do nothing — which is the opposite of the truth.
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue([]);

      const result = await service.getPermissions(otherAdminRow.id);

      expect(result.holdsEverythingByLevel).toBe(true);
    });

    it('is 404 for a customer id, like every other staff route', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(service.getPermissions(customerRow.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPermissions', () => {
    beforeEach(() => {
      permissionGrantRepositoryMock.replaceForUser.mockImplementation(
        (_userId: string, keys: string[]) => Promise.resolve([...keys]),
      );
    });

    it('lets a deputy replace a manager’s set and reports the before-image', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue(['orders:read']);

      const result = await service.setPermissions(
        managerRow.id,
        ['products:write', 'orders:read'],
        deputyActor,
      );

      expect(result.before).toEqual(['orders:read']);
      expect(result.after).toEqual(['orders:read', 'products:write']);
      expect(result.target.email).toBe(managerRow.email);
      expect(permissionGrantRepositoryMock.replaceForUser).toHaveBeenCalledWith(managerRow.id, [
        'orders:read',
        'products:write',
      ]);
    });

    it('replaces rather than merges — an unticked box is a revocation', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue([
        'orders:read',
        'products:write',
      ]);

      const result = await service.setPermissions(managerRow.id, ['orders:read'], ownerActor);

      expect(result.after).toEqual(['orders:read']);
      expect(permissionGrantRepositoryMock.replaceForUser).toHaveBeenCalledWith(managerRow.id, [
        'orders:read',
      ]);
    });

    it('accepts an empty set — revoking everything is a legitimate edit', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue(['orders:read']);

      const result = await service.setPermissions(managerRow.id, [], ownerActor);

      expect(result.after).toEqual([]);
      expect(permissionGrantRepositoryMock.replaceForUser).toHaveBeenCalledWith(managerRow.id, []);
    });

    it('refuses a deputy editing ANOTHER ADMIN’s permissions — invariant 3', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));

      await expect(
        service.setPermissions(otherAdminRow.id, ['orders:read'], deputyActor),
      ).rejects.toThrow(ForbiddenException);
      expect(permissionGrantRepositoryMock.replaceForUser).not.toHaveBeenCalled();
    });

    it('refuses ANYBODY editing the OWNER’s permissions — invariant 2', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(ownerRow));

      for (const actor of [deputyActor, { ...ownerActor, id: 'another-owner' }]) {
        await expect(service.setPermissions(ownerRow.id, ['orders:read'], actor)).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(permissionGrantRepositoryMock.replaceForUser).not.toHaveBeenCalled();
    });

    it('lets the OWNER edit a deputy admin — the level rule has no exception', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));
      permissionGrantRepositoryMock.findByUserId.mockResolvedValue([]);

      await expect(
        service.setPermissions(otherAdminRow.id, ['orders:read'], ownerActor),
      ).resolves.toBeDefined();
    });

    it('refuses a non-grantable key with a 400 that names it, and writes nothing', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      await expect(
        service.setPermissions(managerRow.id, ['orders:read', 'staff:write'], ownerActor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setPermissions(managerRow.id, ['staff:write'], ownerActor),
      ).rejects.toThrow(/staff:write/);
      expect(permissionGrantRepositoryMock.replaceForUser).not.toHaveBeenCalled();
    });

    it('refuses an unknown key', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      await expect(
        service.setPermissions(managerRow.id, ['orders:teleport'], ownerActor),
      ).rejects.toThrow(BadRequestException);
      expect(permissionGrantRepositoryMock.replaceForUser).not.toHaveBeenCalled();
    });

    it('checks the LEVEL before the keys — a refusal must not double as a catalogue probe', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));

      await expect(
        service.setPermissions(otherAdminRow.id, ['orders:teleport'], deputyActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses editing YOUR OWN permissions, with no special case needed', async () => {
      // The other four doors carry an explicit self-check because "you may only
      // manage levels below your own" reads as a bug when the target is you. Here
      // the level rule alone is enough and says the right thing: equal is not
      // below, so nobody can widen their own access — which is the property that
      // matters, and it needs no branch somebody could later relax.
      staffRepositoryMock.findStaffById.mockResolvedValue(
        staffAccount({ ...managerRow, id: deputyActor.id, role: UserRole.ADMIN }),
      );

      await expect(
        service.setPermissions(deputyActor.id, ['orders:read'], deputyActor),
      ).rejects.toThrow(ForbiddenException);
      expect(permissionGrantRepositoryMock.replaceForUser).not.toHaveBeenCalled();
    });

    it('is 404 for a customer id', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(
        service.setPermissions(customerRow.id, ['orders:read'], ownerActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── The transfer: the one door that reaches the owner's own account ────────

  /**
   * Handing over the shop (TASK-478, plan 181, invariant 1).
   *
   * THIS IS THE ONE METHOD ON THIS SERVICE THAT DOES NOT CALL `assertMayManage`,
   * and every case below exists because of that. The level rule makes the owner
   * untouchable through all five other doors — OWNER is the maximum and the
   * comparison is strictly greater — which is exactly right and would also mean an
   * owner who leaves the business is a dead end. The transfer is the door cut for
   * that single case, so the checks the level rule would have performed are
   * re-stated here by hand, and the suite has to prove each of them individually
   * rather than leaning on one shared assert.
   */
  describe('transferOwnership', () => {
    const PASSWORD = 'OwnerP@ssw0rd!';

    /** The two rows the transaction hands back, already flipped. */
    const transferred = {
      outgoing: { ...ownerRow, isOwner: false },
      incoming: { ...otherAdminRow, isOwner: true },
    };

    beforeEach(() => {
      authServiceMock.verifyOwnPassword.mockResolvedValue(undefined);
      staffRepositoryMock.transferOwnership.mockResolvedValue(transferred);
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(otherAdminRow));
    });

    it('moves the flag off the owner and onto the deputy, in that argument order', async () => {
      const result = await service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor);

      // Outgoing first, incoming second — the repository's contract, and the only
      // order the partial unique index permits (staff.repository.spec.ts).
      expect(staffRepositoryMock.transferOwnership).toHaveBeenCalledWith(
        ownerActor.id,
        otherAdminRow.id,
      );

      expect(result.previousOwner.isOwner).toBe(false);
      expect(result.owner.isOwner).toBe(true);
      expect(result.owner.id).toBe(otherAdminRow.id);
    });

    it('leaves the outgoing owner an ADMIN — a state any other door can produce', async () => {
      const result = await service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor);

      // They become an ordinary deputy: exactly what `PATCH :id/role` produces
      // when the owner appoints one, so nothing downstream meets a row it has
      // never seen. Demoting them further is the NEW owner's call, through the
      // door that already exists and already writes its own audit row.
      expect(result.previousOwner.role).toBe(UserRole.ADMIN);
      expect(result.previousOwner.level).toBe(2);
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('revokes the sessions of BOTH parties', async () => {
      await service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor);

      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(ownerActor.id);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(otherAdminRow.id);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledTimes(2);
    });

    it('confirms the CALLER’s own password through the shared auth path', async () => {
      await service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor);

      // The caller's, not the target's: this is a re-authentication of the person
      // giving the shop away, and it is checked by the same code login uses.
      expect(authServiceMock.verifyOwnPassword).toHaveBeenCalledWith(
        ownerActor.id,
        PASSWORD,
        expect.objectContaining({ event: 'staff.ownershipTransferRejected' }),
      );
    });

    it('changes NOTHING when the password is wrong', async () => {
      authServiceMock.verifyOwnPassword.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        service.transferOwnership(otherAdminRow.id, 'not-my-password', ownerActor),
      ).rejects.toThrow(UnauthorizedException);

      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('refuses a deputy admin — @OwnerOnly is re-stated where the actor is known', async () => {
      // The guard already refuses this over HTTP. Re-stated here because the
      // service is callable from anywhere in the process, and this is the one
      // method whose whole purpose is to touch the owner's row.
      await expect(
        service.transferOwnership(otherAdminRow.id, PASSWORD, deputyActor),
      ).rejects.toThrow(ForbiddenException);

      // Not even the argon2 cost: a caller who may not do this at all learns
      // nothing by being asked for a password first.
      expect(authServiceMock.verifyOwnPassword).not.toHaveBeenCalled();
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('is 404 for an unknown id, a customer, or a soft-deleted account', async () => {
      // All three come back null from the staff-scoped lookup, and all three get
      // the same answer — the same reasoning as every other door here.
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await expect(service.transferOwnership(customerRow.id, PASSWORD, ownerActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('refuses a DEACTIVATED account — the shop would be left with no live owner', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(
        staffAccount({ ...otherAdminRow, isActive: false }),
      );

      await expect(
        service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor),
      ).rejects.toThrow(BadRequestException);
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('refuses a MANAGER — appointing a deputy is a separate, audited act', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      await expect(service.transferOwnership(managerRow.id, PASSWORD, ownerActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('refuses transferring to YOURSELF', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(ownerRow));

      await expect(service.transferOwnership(ownerActor.id, PASSWORD, ownerActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('checks the TARGET before spending the argon2 cost on the password', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(staffAccount(managerRow));

      await expect(service.transferOwnership(managerRow.id, PASSWORD, ownerActor)).rejects.toThrow(
        BadRequestException,
      );

      // The password is the CONFIRMATION of an otherwise-valid transfer. Asking
      // for it first would mean an owner who mistyped an id has to get their own
      // password right before being told the id was wrong.
      expect(authServiceMock.verifyOwnPassword).not.toHaveBeenCalled();
    });

    it('revokes nothing when the transaction itself fails', async () => {
      // The database refused (the row vanished, or a second owner appeared).
      // Nothing moved, so nobody is signed out — the outgoing owner must not be
      // left locked out of a shop they still own.
      staffRepositoryMock.transferOwnership.mockRejectedValue(
        Object.assign(new Error('Record to update not found'), { code: 'P2025' }),
      );

      await expect(
        service.transferOwnership(otherAdminRow.id, PASSWORD, ownerActor),
      ).rejects.toThrow();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
    });
  });
});
