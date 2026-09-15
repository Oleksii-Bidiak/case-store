// Permission templates — public API (TASK-477, plan 181)
export { PermissionTemplateModule } from './permission-template.module';
export {
  PermissionTemplateService,
  type AppliedTemplate,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from './permission-template.service';
export { PermissionTemplateController } from './permission-template.controller';
export {
  PermissionTemplateRepository,
  type PermissionTemplateRecord,
  type CreatePermissionTemplateInput,
  type UpdatePermissionTemplateInput,
} from './permission-template.repository';
export { PermissionTemplateEntity, AppliedTemplateEntity } from './entities';
export {
  ApplyPermissionTemplateDto,
  CreatePermissionTemplateDto,
  UpdatePermissionTemplateDto,
} from './dto';
