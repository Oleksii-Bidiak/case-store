import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionTemplateService } from './permission-template.service';
import { PermissionTemplateRepository } from './permission-template.repository';
import { StaffService } from '../staff/staff.service';
import type { PermissionActor } from '../auth/permissions';

/**
 * Templates, and the one rule that makes them safe: APPLYING A TEMPLATE COPIES IT
 * (TASK-477, plan 178 decision 2, plan 181 invariant 5).
 *
 * The headline case is the last describe in this file, and it is worth stating
 * plainly because the code reads as though it could not possibly fail: a template
 * is applied to somebody, the template is then edited, and the person's access
 * does not move. It cannot move — `PermissionTemplateService.apply` reduces the
 * template to a plain `string[]` and hands it to the SAME
 * `StaffService.setPermissions` an owner's checkbox grid calls, so after the call
 * returns nothing anywhere records which template the rows came from.
 *
 * Which is exactly why the test exists. The failure mode this guards against is
 * not a bug in today's code; it is the next contributor's entirely reasonable
 * instinct to add `templateId` to `UserPermission` so the screen can show «за
 * шаблоном Оператор замовлень». The moment that link exists, editing a template
 * changes what a working employee may do — a permission change nobody performed
 * on anybody — and the two copies desynchronise as soon as one person is given
 * one extra key. This spec is what turns that instinct into a red build.
 */

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

const operatorTemplate = {
  id: 'template-1',
  name: 'Оператор замовлень',
  description: 'Телефонує, змінює статуси',
  permissions: ['orders:read', 'orders:write'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const repositoryMock = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const staffServiceMock = {
  setPermissions: jest.fn(),
  getPermissions: jest.fn(),
};

describe('PermissionTemplateService (TASK-477)', () => {
  let service: PermissionTemplateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionTemplateService,
        { provide: PermissionTemplateRepository, useValue: repositoryMock },
        { provide: StaffService, useValue: staffServiceMock },
      ],
    }).compile();

    service = module.get(PermissionTemplateService);
  });

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('stores a de-duplicated, sorted set', async () => {
      repositoryMock.findByName.mockResolvedValue(null);
      repositoryMock.create.mockResolvedValue(operatorTemplate);

      await service.create({
        name: 'Оператор замовлень',
        permissions: ['orders:write', 'orders:read', 'orders:read'],
      });

      expect(repositoryMock.create).toHaveBeenCalledWith({
        name: 'Оператор замовлень',
        description: null,
        permissions: ['orders:read', 'orders:write'],
      });
    });

    it('refuses a non-grantable key — a template must not be a back door', async () => {
      // The whole argument for `grantable: false` collapses if the key an owner
      // cannot tick on a person can be put in a template and then applied.
      repositoryMock.findByName.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Тіньовий адмін', permissions: ['orders:read', 'staff:write'] }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ name: 'Тіньовий адмін', permissions: ['audit:read'] }),
      ).rejects.toThrow(/audit:read/);
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown key', async () => {
      repositoryMock.findByName.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Хибний', permissions: ['orders:teleport'] }),
      ).rejects.toThrow(BadRequestException);
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses a duplicate name — the name is how the owner picks one', async () => {
      repositoryMock.findByName.mockResolvedValue(operatorTemplate);

      await expect(
        service.create({ name: 'Оператор замовлень', permissions: ['orders:read'] }),
      ).rejects.toThrow(ConflictException);
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('replaces the whole set when permissions are sent', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);
      repositoryMock.update.mockResolvedValue(operatorTemplate);

      await service.update('template-1', { permissions: ['orders:read'] });

      expect(repositoryMock.update).toHaveBeenCalledWith('template-1', {
        permissions: ['orders:read'],
      });
    });

    it('leaves the set alone when only the name changes', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);
      repositoryMock.update.mockResolvedValue(operatorTemplate);

      await service.update('template-1', { name: 'Оператор' });

      expect(repositoryMock.update).toHaveBeenCalledWith('template-1', { name: 'Оператор' });
    });

    it('refuses a non-grantable key on edit as firmly as on create', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);

      await expect(
        service.update('template-1', { permissions: ['orders:read', 'staff:read'] }),
      ).rejects.toThrow(BadRequestException);
      expect(repositoryMock.update).not.toHaveBeenCalled();
    });

    it('is 404 for a template that does not exist', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('refuses renaming onto another template’s name', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);
      repositoryMock.findByName.mockResolvedValue({ ...operatorTemplate, id: 'template-2' });

      await expect(service.update('template-1', { name: 'Контент-менеджер' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the template', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);

      await service.remove('template-1');

      expect(repositoryMock.remove).toHaveBeenCalledWith('template-1');
    });

    it('is 404 for a template that does not exist', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Applying ───────────────────────────────────────────────────────────────

  describe('apply', () => {
    beforeEach(() => {
      staffServiceMock.setPermissions.mockResolvedValue({
        before: [],
        after: ['orders:read', 'orders:write'],
        target: { id: 'manager-1', email: 'manager@example.com' },
        entity: { userId: 'manager-1' },
      });
    });

    it('hands the template’s keys to the ONE write that grants a person anything', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);

      await service.apply('template-1', 'manager-1', deputyActor);

      expect(staffServiceMock.setPermissions).toHaveBeenCalledWith(
        'manager-1',
        ['orders:read', 'orders:write'],
        deputyActor,
      );
    });

    it('passes a plain array — nothing that could become a link later', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);

      await service.apply('template-1', 'manager-1', ownerActor);

      const [, keys] = staffServiceMock.setPermissions.mock.calls[0] as [string, unknown, unknown];
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toEqual(['orders:read', 'orders:write']);
    });

    it('reports the before-image the audit row needs', async () => {
      repositoryMock.findById.mockResolvedValue(operatorTemplate);
      staffServiceMock.setPermissions.mockResolvedValue({
        before: ['blog:write'],
        after: ['orders:read', 'orders:write'],
        target: { id: 'manager-1', email: 'manager@example.com' },
        entity: { userId: 'manager-1' },
      });

      const result = await service.apply('template-1', 'manager-1', ownerActor);

      expect(result.before).toEqual(['blog:write']);
      expect(result.after).toEqual(['orders:read', 'orders:write']);
      expect(result.template.name).toBe('Оператор замовлень');
    });

    it('is 404 for a template that does not exist, and writes nothing', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.apply('nope', 'manager-1', ownerActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(staffServiceMock.setPermissions).not.toHaveBeenCalled();
    });

    it('lets the level rule refuse the target — applying is a grant like any other', async () => {
      // The assert lives in `setPermissions`, which is the point: there is one
      // write, so there is one place the level rule can be forgotten, and it is
      // covered by `staff.service.spec.ts`. Here we only prove apply does not
      // route around it.
      repositoryMock.findById.mockResolvedValue(operatorTemplate);
      staffServiceMock.setPermissions.mockRejectedValue(new ForbiddenException());

      await expect(service.apply('template-1', 'admin-2', deputyActor)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── Invariant 5: a template is a COPY, not a link ──────────────────────────

  describe('invariant 5 — editing a template moves nobody’s access', () => {
    /**
     * A tiny stand-in for the two tables, so the sequence below is a real
     * sequence rather than three unrelated assertions: apply, then edit, then
     * look at the person again.
     */
    function withStore() {
      const templates = new Map<string, typeof operatorTemplate>();
      const granted = new Map<string, string[]>();

      templates.set(operatorTemplate.id, { ...operatorTemplate });

      repositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve(templates.get(id) ?? null),
      );
      repositoryMock.findByName.mockResolvedValue(null);
      repositoryMock.update.mockImplementation(
        (id: string, data: { permissions?: string[]; name?: string }) => {
          const current = templates.get(id);
          if (!current) return Promise.resolve(null);
          const next = { ...current, ...data };
          templates.set(id, next);
          return Promise.resolve(next);
        },
      );
      staffServiceMock.setPermissions.mockImplementation((userId: string, keys: string[]) => {
        const before = granted.get(userId) ?? [];
        granted.set(userId, [...keys]);
        return Promise.resolve({
          before,
          after: [...keys],
          target: { id: userId, email: `${userId}@example.com` },
          entity: { userId, permissions: [...keys] },
        });
      });

      return { templates, granted };
    }

    it('editing a template does not change what somebody already set up from it can do', async () => {
      const { granted } = withStore();

      await service.apply('template-1', 'manager-1', ownerActor);
      expect(granted.get('manager-1')).toEqual(['orders:read', 'orders:write']);

      // The owner decides order operators should also see payments — for the NEXT
      // hire. Nobody performed a permission change on the person already working.
      await service.update('template-1', {
        permissions: ['orders:read', 'orders:write', 'payments:read'],
      });

      expect(granted.get('manager-1')).toEqual(['orders:read', 'orders:write']);
    });

    it('a person given an extra key beyond the template never drifts back to it', async () => {
      const { granted } = withStore();

      await service.apply('template-1', 'manager-1', ownerActor);

      // One extra tick on top of the template — the case a live link would
      // desynchronise on.
      await staffServiceMock.setPermissions(
        'manager-1',
        ['orders:read', 'orders:write', 'blog:write'],
        ownerActor,
      );
      expect(granted.get('manager-1')).toEqual(['orders:read', 'orders:write', 'blog:write']);

      await service.update('template-1', { permissions: ['orders:read'] });

      expect(granted.get('manager-1')).toEqual(['orders:read', 'orders:write', 'blog:write']);
    });

    it('deleting a template leaves the people set up from it untouched', async () => {
      const { granted } = withStore();
      repositoryMock.remove.mockResolvedValue(undefined);

      await service.apply('template-1', 'manager-1', ownerActor);
      await service.remove('template-1');

      expect(granted.get('manager-1')).toEqual(['orders:read', 'orders:write']);
    });

    it('applying the same template twice to two people gives each their own copy', async () => {
      const { granted } = withStore();

      await service.apply('template-1', 'manager-1', ownerActor);
      await service.apply('template-1', 'manager-2', ownerActor);

      await staffServiceMock.setPermissions('manager-1', ['orders:read'], ownerActor);

      expect(granted.get('manager-1')).toEqual(['orders:read']);
      expect(granted.get('manager-2')).toEqual(['orders:read', 'orders:write']);
    });
  });
});
