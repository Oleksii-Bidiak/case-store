import { Global, Module } from '@nestjs/common';
import { PermissionRepository } from './permission.repository';
import { PermissionService } from './permission.service';
import { PermissionGuard } from './permission.guard';
import { PermissionController } from './permission.controller';

/**
 * RBAC (TASK-334).
 *
 * `@Global()` is load-bearing, not convenience. `PermissionGuard` is referenced
 * by `@UseGuards()` in ~23 feature modules; Nest registers such a guard as an
 * injectable of the HOST module and resolves its constructor from that module's
 * injector. If `PermissionService` were not globally available, the guard would
 * fail to construct in every module that did not import this one — and a guard
 * that cannot be constructed is a route that is not guarded.
 */
@Global()
@Module({
  controllers: [PermissionController],
  providers: [PermissionRepository, PermissionService, PermissionGuard],
  exports: [PermissionRepository, PermissionService, PermissionGuard],
})
export class PermissionModule {}
