import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PermissionService } from './permission.service';
import { PermissionRepository, type PermissionActor } from './permission.repository';
import { PERMISSIONS } from './permission.catalog';

/**
 * The resolution layer, per person (TASK-475, plan 181).
 *
 * The role→permission matrix is gone: there is nothing left to cache, nothing to
 * invalidate and no role that carries rights of its own. What remains is three
 * levels, and every test below pins one edge of the boundary between them:
 *
 *   - the OWNER (`isOwner`) passes everything, including the reserve;
 *   - an ADMIN passes every permission without holding a single row, but the
 *     reserve is not theirs (that half lives in the guard, where `@OwnerOnly`
 *     is read);
 *   - a MANAGER passes exactly the rows they personally hold, and nothing else.
 */

const repositoryMock = {
  findActor: jest.fn(),
};

function actor(overrides: Partial<PermissionActor> = {}): PermissionActor {
  return {
    id: 'u1',
    email: 'staff@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set<string>(),
    ...overrides,
  };
}

describe('PermissionService (TASK-475)', () => {
  let service: PermissionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionService, { provide: PermissionRepository, useValue: repositoryMock }],
    }).compile();

    service = module.get(PermissionService);
  });

  describe('actorHasPermission — the three levels', () => {
    it('grants the owner everything, whatever rows they hold', () => {
      const owner = actor({ role: UserRole.ADMIN, isOwner: true });

      expect(service.actorHasPermission(owner, 'orders:read')).toBe(true);
      expect(service.actorHasPermission(owner, 'payments:refund')).toBe(true);
      expect(service.actorHasPermission(owner, 'staff:write')).toBe(true);
    });

    it('grants a deputy ADMIN every permission without a single row of their own', () => {
      // The deputy exists so the shop runs while the owner is away. Making them
      // assemble their own rights tick by tick would defeat that, and a row set
      // that has to be kept in sync with the catalogue drifts the day a new
      // permission ships.
      const deputy = actor({ role: UserRole.ADMIN, isOwner: false });

      expect(deputy.permissions.size).toBe(0);
      expect(service.actorHasPermission(deputy, 'orders:read')).toBe(true);
      expect(service.actorHasPermission(deputy, 'audit:read')).toBe(true);
    });

    it('grants a MANAGER only the permissions they personally hold (invariant 4)', () => {
      const manager = actor({ permissions: new Set(['blog:write']) });

      expect(service.actorHasPermission(manager, 'blog:write')).toBe(true);
      expect(service.actorHasPermission(manager, 'orders:read')).toBe(false);
    });

    it('denies a MANAGER with no rows at all — absence is denial, not "unknown"', () => {
      // Invariant 4 of plan 181, and the reason a newly shipped admin section is
      // never silently handed to everyone who is already working here.
      const fresh = actor();

      for (const permission of PERMISSIONS) {
        expect(service.actorHasPermission(fresh, permission.key)).toBe(false);
      }
    });

    it('denies a CUSTOMER even when rows survive on their account', () => {
      // Demotion does not delete rows, so this is the real case: a manager is
      // moved down to CUSTOMER and their old grants are still sitting there. The
      // role check is what makes the demotion mean something.
      const demoted = actor({
        role: UserRole.CUSTOMER,
        permissions: new Set(['orders:read', 'products:write']),
      });

      expect(service.actorHasPermission(demoted, 'orders:read')).toBe(false);
      expect(service.actorHasPermission(demoted, 'products:write')).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    it('reads the level from the database, not from the caller-supplied token', async () => {
      repositoryMock.findActor.mockResolvedValue(
        actor({ permissions: new Set(['blog:write', 'faq:write']) }),
      );

      await expect(service.getEffectivePermissions('u1')).resolves.toEqual({
        role: UserRole.MANAGER,
        isOwner: false,
        isAdmin: false,
        permissions: ['blog:write', 'faq:write'],
      });
    });

    it('gives the owner the entire catalogue, flagged as owner', async () => {
      repositoryMock.findActor.mockResolvedValue(
        actor({ role: UserRole.ADMIN, isOwner: true, email: 'owner@example.com' }),
      );

      const result = await service.getEffectivePermissions('u1');

      expect(result.isOwner).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.permissions).toHaveLength(PERMISSIONS.length);
    });

    it('gives a deputy ADMIN the entire catalogue but does NOT call them the owner', async () => {
      // The frontend hides the owner's reserve behind `isOwner`. Reporting a
      // deputy as the owner would offer them buttons whose only outcome is a 403
      // — and would teach them the reserve is theirs.
      repositoryMock.findActor.mockResolvedValue(actor({ role: UserRole.ADMIN, isOwner: false }));

      const result = await service.getEffectivePermissions('u1');

      expect(result.isOwner).toBe(false);
      expect(result.isAdmin).toBe(true);
      expect(result.permissions).toHaveLength(PERMISSIONS.length);
    });

    it('reports nothing for an account that no longer resolves (deleted or banned)', async () => {
      repositoryMock.findActor.mockResolvedValue(null);

      await expect(service.getEffectivePermissions('gone')).resolves.toEqual({
        role: UserRole.CUSTOMER,
        isOwner: false,
        isAdmin: false,
        permissions: [],
      });
    });

    it('reports nothing for a CUSTOMER, whatever rows survive on the account', async () => {
      repositoryMock.findActor.mockResolvedValue(
        actor({ role: UserRole.CUSTOMER, permissions: new Set(['orders:read']) }),
      );

      await expect(service.getEffectivePermissions('u1')).resolves.toEqual({
        role: UserRole.CUSTOMER,
        isOwner: false,
        isAdmin: false,
        permissions: [],
      });
    });
  });

  describe('what is no longer here', () => {
    it('has no role-matrix surface left to keep in sync', () => {
      // The matrix is not deprecated, it is gone: with rights on the person there
      // is no role-wide set to read, write or cache, and therefore no cache to go
      // stale (invariant 8). Asserted rather than assumed, because a re-added
      // `getRoleGrants` would compile perfectly and quietly reintroduce a second
      // source of truth.
      const surface = service as unknown as Record<string, unknown>;

      expect(surface.getRoleGrants).toBeUndefined();
      expect(surface.setRoleGrants).toBeUndefined();
      expect(surface.getMatrix).toBeUndefined();
      expect(surface.roleHasPermission).toBeUndefined();
    });
  });
});
