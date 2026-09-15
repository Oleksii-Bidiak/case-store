import { Global, Module } from '@nestjs/common';
import { PermissionRepository } from './permission.repository';
import { PermissionGrantRepository } from './permission-grant.repository';
import { PermissionService } from './permission.service';
import { PermissionGuard } from './permission.guard';

/**
 * RBAC (TASK-334).
 *
 * `@Global()` is load-bearing, not convenience. `PermissionGuard` is referenced
 * by `@UseGuards()` in ~23 feature modules; Nest registers such a guard as an
 * injectable of the HOST module and resolves its constructor from that module's
 * injector. If `PermissionService` were not globally available, the guard would
 * fail to construct in every module that did not import this one — and a guard
 * that cannot be constructed is a route that is not guarded.
 *
 * No controller of its own since TASK-475: the role-matrix API disappeared with
 * the matrix, and the per-person replacement lives under `/api/admin/staff`.
 *
 * `PermissionGrantRepository` (TASK-477) is exported for the same reason the rest
 * is: the two services that grant a person anything — `StaffService` and
 * `PermissionTemplateService` — live in different modules, and the ONE writer of
 * `user_permissions` must be shared rather than reimplemented in each.
 */
@Global()
@Module({
  providers: [PermissionRepository, PermissionGrantRepository, PermissionService, PermissionGuard],
  exports: [PermissionRepository, PermissionGrantRepository, PermissionService, PermissionGuard],
})
export class PermissionModule {}
