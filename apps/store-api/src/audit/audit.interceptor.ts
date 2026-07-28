import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { AuditService } from './audit.service';
import { bodyToDiff } from './audit.sanitize';
import {
  OWNER_ONLY_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../auth/permissions/require-permission.decorator';
import type { PermissionActor } from '../auth/permissions/permission.repository';

/** HTTP verbs that change something. A GET is a read, and logging every admin
 *  read would bury the writes nobody can otherwise explain. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Route params, in preference order, that name the thing being acted on. */
const ENTITY_ID_PARAMS = ['id', 'orderId', 'productId', 'imageId', 'categoryId', 'slug'];

interface AuditableRequest extends Request {
  user?: { id?: string };
  permissionActor?: PermissionActor;
}

/**
 * AuditInterceptor — writes the action log (TASK-318).
 *
 * Sits alongside `common/interceptors/logging.interceptor.ts`: that one produces
 * ephemeral log lines for operators, this one produces durable rows the shop
 * owner reads in the admin UI to answer "who changed this, and when".
 *
 * WHAT IT COVERS: every MUTATING request on a route carrying `@RequirePermission`
 * or `@OwnerOnly()` — i.e. exactly the admin surface, defined by the same
 * annotations the guard enforces. Deriving the scope from the annotations rather
 * than from a hand-kept list of paths is what stops the two drifting: a new admin
 * endpoint is audited the moment it is guarded, and an endpoint that loses its
 * guard fails the catalogue test long before it silently stops being audited.
 *
 * WHAT IT DOES NOT COVER: reads, storefront traffic, and failed requests. A
 * rejected mutation changed nothing, and logging 403s here would let anyone with
 * a token fill the owner's audit screen with noise; the guard already logs
 * refusals to the operator log.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.isAuditable(context)) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditableRequest>();

    // Snapshot the body NOW: an interceptor's tap runs after the handler, and a
    // handler is free to mutate the object it was handed.
    const diff = bodyToDiff(request.body);
    const entityType = entityTypeFromController(context.getClass().name);
    const action = `${entityType}.${context.getHandler().name}`;
    const paramEntityId = pickEntityId(request.params);
    const summary = `${request.method} ${request.originalUrl ?? request.url}`;

    return next.handle().pipe(
      tap({
        next: (response) => {
          const actor = request.permissionActor;

          void this.auditService.record({
            actorId: actor?.id ?? request.user?.id ?? null,
            // Taken from the guard's DB lookup, so the row records who the
            // caller REALLY was — not what a 15-minute-old token claimed.
            actorEmail: actor?.email ?? null,
            actorRole: actor?.role ?? null,
            action,
            entityType,
            entityId: paramEntityId ?? entityIdFromResponse(response),
            summary,
            diff,
            ip: request.ip ?? null,
            userAgent: request.headers['user-agent'] ?? null,
          });
        },
      }),
    );
  }

  /** A mutating request on a route the RBAC annotations mark as admin. */
  private isAuditable(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuditableRequest>();
    if (!MUTATING_METHODS.has(request.method)) {
      return false;
    }

    const targets = [context.getHandler(), context.getClass()];
    return Boolean(
      this.reflector.getAllAndOverride<string | undefined>(REQUIRE_PERMISSION_KEY, targets) ??
      this.reflector.getAllAndOverride<boolean | undefined>(OWNER_ONLY_KEY, targets),
    );
  }
}

/**
 * `AdminBannersController` → `banners`, `UserController` → `user`.
 *
 * Derived from the class name rather than declared per route: a hand-written
 * `@AuditEntity('Banner')` on 43 routes is 43 chances to paste the wrong one,
 * and the value would then be wrong in exactly the rows someone is searching.
 */
export function entityTypeFromController(className: string): string {
  const stripped = className.replace(/Controller$/, '').replace(/^Admin/, '');
  return stripped.length > 0 ? stripped[0].toLowerCase() + stripped.slice(1) : className;
}

/** The route param naming the affected entity, if the route has one. */
function pickEntityId(params: Record<string, string | string[]> | undefined): string | null {
  if (!params) {
    return null;
  }
  for (const key of ENTITY_ID_PARAMS) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * A create has no id in its route — it is in the response envelope. Read
 * defensively: a handler returning 204, a string, or a list must not throw here
 * and take the whole request down with it.
 */
function entityIdFromResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}
