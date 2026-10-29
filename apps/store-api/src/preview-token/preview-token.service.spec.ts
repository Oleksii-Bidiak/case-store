import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PageKind, UserRole } from '@prisma/client';
import { PermissionService, type PermissionActor } from '../auth/permissions';
import { PreviewTokenRepository } from './preview-token.repository';
import { PreviewTokenService } from './preview-token.service';

const ID = '550e8400-e29b-41d4-a716-446655440000';

const actor = (permissions: string[]): PermissionActor =>
  ({
    id: 'manager',
    email: 'm@x.test',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(permissions),
  }) as PermissionActor;

describe('PreviewTokenService (TASK-668)', () => {
  const repository = {
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    findProduct: jest.fn(),
    findPage: jest.fn(),
    findPost: jest.fn(),
  };
  const permissionService = {
    actorHasPermission: (a: PermissionActor, key: string) => a.permissions.has(key),
  };
  const config = { getOrThrow: () => 'a-jwt-secret-that-is-at-least-32-characters' };
  let service: PreviewTokenService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getVersion.mockResolvedValue(0);
    service = new PreviewTokenService(
      repository as unknown as PreviewTokenRepository,
      permissionService as unknown as PermissionService,
      config as unknown as ConfigService,
    );
  });

  it('issues a home link for home:read, 24 h, path /', async () => {
    const now = new Date('2026-10-07T12:00:00.000Z');
    const issued = await service.issue({ type: 'home' }, actor(['home:read']), now);

    expect(issued.path).toBe('/');
    expect(issued.expiresAt.toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(await service.validScope(issued.token, now)).toEqual({ type: 'home' });
  });

  it('demands the right that SEES the thing asked for', async () => {
    await expect(service.issue({ type: 'home' }, actor(['products:read']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.issue({ type: 'post', id: ID }, actor(['pages:write'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    repository.findPost.mockResolvedValue({ id: ID, slug: 'news' });
    await expect(
      service.issue({ type: 'post', id: ID }, actor(['blog:read'])),
    ).resolves.toMatchObject({ path: '/blog/news' });
  });

  it('builds the storefront path per kind and refuses a HUB page or a missing target', async () => {
    repository.findProduct.mockResolvedValue({ id: ID, slug: 'case' });
    repository.findPage.mockResolvedValueOnce({ id: ID, slug: 'offer', kind: PageKind.LEGAL });
    repository.findPage.mockResolvedValueOnce({ id: ID, slug: 'about', kind: PageKind.INFO });
    repository.findPage.mockResolvedValueOnce({ id: ID, slug: 'blog', kind: PageKind.HUB });
    const owner = { ...actor([]), isOwner: true } as PermissionActor;
    const ownerService = new PreviewTokenService(
      repository as unknown as PreviewTokenRepository,
      { actorHasPermission: () => true } as unknown as PermissionService,
      config as unknown as ConfigService,
    );

    expect((await ownerService.issue({ type: 'product', id: ID }, owner)).path).toBe(
      '/products/case',
    );
    expect((await ownerService.issue({ type: 'page', id: ID }, owner)).path).toBe('/legal/offer');
    expect((await ownerService.issue({ type: 'page', id: ID }, owner)).path).toBe('/info/about');
    await expect(ownerService.issue({ type: 'page', id: ID }, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repository.findProduct.mockResolvedValue(null);
    await expect(ownerService.issue({ type: 'product', id: ID }, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(ownerService.issue({ type: 'product' }, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a revoke (version bump) kills every older token', async () => {
    const issued = await service.issue({ type: 'home' }, actor(['home:write']));
    expect(await service.validScope(issued.token)).toEqual({ type: 'home' });

    repository.getVersion.mockResolvedValue(1);
    expect(await service.validScope(issued.token)).toBeNull();
    await expect(service.resolve(issued.token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ignores an expired token', async () => {
    const issued = await service.issue({ type: 'home' }, actor(['home:read']));
    const later = new Date(issued.expiresAt.getTime() + 1000);
    expect(await service.validScope(issued.token, later)).toBeNull();
  });

  it('resolves to the CURRENT slug and 404s when the target is gone', async () => {
    repository.findPost.mockResolvedValueOnce({ id: ID, slug: 'old' });
    const issued = await service.issue({ type: 'post', id: ID }, actor(['blog:write']));

    repository.findPost.mockResolvedValueOnce({ id: ID, slug: 'renamed' });
    await expect(service.resolve(issued.token)).resolves.toMatchObject({
      scope: `post:${ID}`,
      path: '/blog/renamed',
    });

    repository.findPost.mockResolvedValueOnce(null);
    await expect(service.resolve(issued.token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokeAll bumps the generation', async () => {
    await service.revokeAll();
    expect(repository.bumpVersion).toHaveBeenCalledTimes(1);
  });
});
