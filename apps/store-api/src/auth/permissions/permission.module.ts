import { Global, Module } from '@nestjs/common';
import { PermissionRepository } from './permission.repository';
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
 */
@Global()
@Module({
  providers: [PermissionRepository, PermissionService, PermissionGuard],
  exports: [PermissionRepository, PermissionService, PermissionGuard],
})
export class PermissionModule {}
