import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { AuditInterceptor, entityTypeFromController } from './audit.interceptor';
import type { AuditService } from './audit.service';
import { REQUIRE_PERMISSION_KEY } from '../auth/permissions/require-permission.decorator';

/**
 * TASK-628: which id an audit row is keyed by.
 *
 * `POST /admin/orders/:orderId/returns` creates a RETURN, but the path names the
 * ORDER — and the path param used to win, so the row read
 * `entityType: 'return', entityId: <order uuid>` and the new return's id was
 * recorded nowhere. The resolution rows (`/admin/returns/:returnId`) carry the
 * return's id, so the two halves of one return's history never met in a search.
 */

// Class names matter: the entity type is derived from them.
class AdminOrderReturnController {}
class AdminOrderController {}
class AttributeDefinitionController {}

function handler(): void {}

function run(
  controller: new () => unknown,
  request: { method: string; params?: Record<string, string>; body?: unknown },
  response: unknown,
) {
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };
  const reflector = {
    get: jest.fn().mockReturnValue(undefined),
    getAllAndOverride: jest.fn((key: string) =>
      key === REQUIRE_PERMISSION_KEY ? 'orders:write' : undefined,
    ),
  };
  const interceptor = new AuditInterceptor(
    reflector as unknown as Reflector,
    auditService as unknown as AuditService,
  );
  const req = {
    url: '/api/x',
    originalUrl: '/api/x',
    headers: {},
    ip: '127.0.0.1',
    body: {},
    params: {},
    ...request,
  };
  const context = {
    getType: () => 'http',
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(response) };

  return { auditService, done: lastValueFrom(interceptor.intercept(context, next)) };
}

describe('AuditInterceptor — entity id of a create (TASK-628)', () => {
  it('keys an operator-opened return by the RETURN id, not the order in the path', async () => {
    const { auditService, done } = run(
      AdminOrderReturnController,
      { method: 'POST', params: { orderId: 'order-uuid' } },
      { data: { id: 'return-uuid' } },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'return', entityId: 'return-uuid' }),
    );
  });

  it('keys a child created under a category by the CHILD id', async () => {
    const { auditService, done } = run(
      AttributeDefinitionController,
      { method: 'POST', params: { categoryId: 'category-uuid' } },
      { data: { id: 'definition-uuid' } },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'attributeDefinition', entityId: 'definition-uuid' }),
    );
  });

  it('keeps the path id when the path names the audited entity itself', async () => {
    // POST /admin/orders/:orderId/access-link acts ON the order — the response
    // is not a new entity, and must not displace the order id.
    const { auditService, done } = run(
      AdminOrderController,
      { method: 'POST', params: { orderId: 'order-uuid' } },
      { data: { id: 'something-else' } },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'order', entityId: 'order-uuid' }),
    );
  });

  it('keeps the path id for a non-create even when the path names another entity', async () => {
    const { auditService, done } = run(
      AttributeDefinitionController,
      { method: 'PATCH', params: { categoryId: 'category-uuid' } },
      { data: { id: 'definition-uuid' } },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'category-uuid' }),
    );
  });

  it('falls back to the path id when a create returns no id', async () => {
    const { auditService, done } = run(
      AdminOrderReturnController,
      { method: 'POST', params: { orderId: 'order-uuid' } },
      { data: [] },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'order-uuid' }),
    );
  });

  it('uses the response id for a plain create with no path id', async () => {
    const { auditService, done } = run(
      AdminOrderController,
      { method: 'POST' },
      { data: { id: 'new-order' } },
    );
    await done;

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'new-order' }),
    );
  });
});

describe('entityTypeFromController', () => {
  it('applies the per-class override', () => {
    expect(entityTypeFromController('AdminOrderReturnController')).toBe('return');
  });

  it('derives the type from the class name', () => {
    expect(entityTypeFromController('AdminBannersController')).toBe('banners');
    expect(entityTypeFromController('UserController')).toBe('user');
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'does not read %s off Object.prototype (TASK-628)',
    (name) => {
      expect(typeof entityTypeFromController(name)).toBe('string');
      expect(entityTypeFromController(name)).toBe(name);
    },
  );
});
