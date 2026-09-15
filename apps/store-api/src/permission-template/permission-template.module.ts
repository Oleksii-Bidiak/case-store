import { Module } from '@nestjs/common';
import { PermissionTemplateRepository } from './permission-template.repository';
import { PermissionTemplateService } from './permission-template.service';
import { PermissionTemplateController } from './permission-template.controller';
import { StaffModule } from '../staff';

/**
 * «Шаблони прав» (TASK-477, plan 181).
 *
 * `StaffModule` for `StaffService`, and the dependency direction is the point:
 * applying a template must go through the SAME `setPermissions` an owner's
 * checkbox grid calls, so that the level rule (`assertMayManage`) and the
 * grantable-key check cannot be forgotten on this path, and so there is exactly
 * one function in the codebase that grants a person anything.
 *
 * The arrow never points back. `StaffModule` knows nothing about templates,
 * because a person's rights do not depend on one after they are copied — that is
 * the copy rule (plan 178, decision 2) expressed as module structure. If a future
 * change makes `StaffModule` import this one, the link this design rejected has
 * probably just been rebuilt; read `permission-template.service.ts` first.
 *
 * `AuditService` needs no import here: `AuditModule` is `@Global()`.
 */
@Module({
  imports: [StaffModule],
  controllers: [PermissionTemplateController],
  providers: [PermissionTemplateRepository, PermissionTemplateService],
  exports: [PermissionTemplateService],
})
export class PermissionTemplateModule {}
