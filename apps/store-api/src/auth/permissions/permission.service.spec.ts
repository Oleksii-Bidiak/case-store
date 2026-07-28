import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { UserRole } from '@prisma/client';
import { PermissionService } from './permission.service';
import { PermissionRepository } from './permission.repository';
import { CacheService } from '../../cache';
import { PERMISSIONS } from './permission.catalog';

const repositoryMock = {
  findActor: jest.fn(),
  findGrantedByRole: jest.fn(),
  findAll: jest.fn(),
  replaceRoleGrants: jest.fn(),
};

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPrefix: jest.fn(),
};

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function row(role: UserRole, permission: string) {
  return {
    id: `${role}-${permission}`,
    role,
    permission,
    allowed: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('PermissionService (TASK-334)', () => {
  let service: PermissionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheMock.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: PermissionRepository, useValue: repositoryMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get(PermissionService);
  });

  describe('the two hard rules', () => {
    it('grants ADMIN everything without consulting the matrix at all', async () => {
      // Rule 2. If the owner's access could ever depend on a database row, a
      // mis-edit of that row locks them out of their own shop, and the only way
      // back is shell access to production.
      await expect(service.roleHasPermission(UserRole.ADMIN, 'orders:read')).resolves.toBe(true);
      await expect(service.roleHasPermission(UserRole.ADMIN, 'payments:refund')).resolves.toBe(
        true,
      );

      expect(repositoryMock.findGrantedByRole).not.toHaveBeenCalled();
      expect(cacheMock.get).not.toHaveBeenCalled();
    });

    it('denies a permission that has no row — absence is denial, not "unknown"', async () => {
      // Rule 1. This is what stops a newly shipped admin section being silently
      // handed to every existing MANAGER on release day.
      repositoryMock.findGrantedByRole.mockResolvedValue([row(UserRole.MANAGER, 'blog:write')]);

      await expect(service.roleHasPermission(UserRole.MANAGER, 'orders:read')).resolves.toBe(false);
      await expect(service.roleHasPermission(UserRole.MANAGER, 'blog:write')).resolves.toBe(true);
    });

    it('denies CUSTOMER without a database lookup', async () => {
      await expect(service.roleHasPermission(UserRole.CUSTOMER, 'blog:write')).resolves.toBe(false);
      expect(repositoryMock.findGrantedByRole).not.toHaveBeenCalled();
    });
  });

  describe('getRoleGrants', () => {
    it('ignores rows naming a permission the code catalogue no longer declares', async () => {
      // A renamed or deleted permission leaves stale rows behind. Honouring one
      // would grant access to a capability nobody can see in the matrix.
      repositoryMock.findGrantedByRole.mockResolvedValue([
        row(UserRole.MANAGER, 'blog:write'),
        row(UserRole.MANAGER, 'ghost:permission'),
      ]);

      await expect(service.getRoleGrants(UserRole.MANAGER)).resolves.toEqual(['blog:write']);
    });

    it('serves a cached grant set without touching the database', async () => {
      cacheMock.get.mockResolvedValue(['blog:write']);

      await expect(service.getRoleGrants(UserRole.MANAGER)).resolves.toEqual(['blog:write']);
      expect(repositoryMock.findGrantedByRole).not.toHaveBeenCalled();
    });

    it('caches what it read, so the next request is a cache hit', async () => {
      repositoryMock.findGrantedByRole.mockResolvedValue([row(UserRole.MANAGER, 'blog:write')]);

      await service.getRoleGrants(UserRole.MANAGER);

      expect(cacheMock.set).toHaveBeenCalledWith(
        'rbac:role-grants:MANAGER',
        ['blog:write'],
        expect.any(Number),
      );
    });
  });

  describe('setRoleGrants', () => {
    it('evicts the cache AFTER the write, so the next request sees the new set', async () => {
      const order: string[] = [];
      repositoryMock.replaceRoleGrants.mockImplementation(async () => {
        order.push('write');
      });
      cacheMock.del.mockImplementation(async () => {
        order.push('evict');
      });

      await service.setRoleGrants(UserRole.MANAGER, ['blog:write']);

      // Evicting first would leave a window where a concurrent request
      // repopulates the cache from the PRE-write rows and then serves them for
      // the whole TTL — the exact failure the eviction exists to prevent.
      expect(order).toEqual(['write', 'evict']);
      expect(cacheMock.del).toHaveBeenCalledWith('rbac:role-grants:MANAGER');
    });

    it('refuses to write an ADMIN row', async () => {
      await expect(service.setRoleGrants(UserRole.ADMIN, [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repositoryMock.replaceRoleGrants).not.toHaveBeenCalled();
    });

    it('refuses a permission key that is not in the code catalogue', async () => {
      await expect(
        service.setRoleGrants(UserRole.MANAGER, ['blog:write', 'blog:writ']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repositoryMock.replaceRoleGrants).not.toHaveBeenCalled();
    });

    it('de-duplicates before writing', async () => {
      await service.setRoleGrants(UserRole.MANAGER, ['blog:write', 'blog:write']);

      expect(repositoryMock.replaceRoleGrants).toHaveBeenCalledWith(UserRole.MANAGER, [
        'blog:write',
      ]);
    });
  });

  describe('getEffectivePermissions', () => {
    it('reads the role from the database, not from the caller-supplied token', async () => {
      repositoryMock.findActor.mockResolvedValue({
        id: 'u1',
        email: 'm@example.com',
        role: UserRole.MANAGER,
      });
      repositoryMock.findGrantedByRole.mockResolvedValue([row(UserRole.MANAGER, 'blog:write')]);

      await expect(service.getEffectivePermissions('u1')).resolves.toEqual({
        role: UserRole.MANAGER,
        isOwner: false,
        permissions: ['blog:write'],
      });
    });

    it('gives the owner the entire catalogue', async () => {
      repositoryMock.findActor.mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        role: UserRole.ADMIN,
      });

      const result = await service.getEffectivePermissions('u1');

      expect(result.isOwner).toBe(true);
      expect(result.permissions).toHaveLength(PERMISSIONS.length);
    });

    it('reports nothing for an account that no longer resolves (deleted or banned)', async () => {
      repositoryMock.findActor.mockResolvedValue(null);

      await expect(service.getEffectivePermissions('gone')).resolves.toEqual({
        role: UserRole.CUSTOMER,
        isOwner: false,
        permissions: [],
      });
    });
  });
});
