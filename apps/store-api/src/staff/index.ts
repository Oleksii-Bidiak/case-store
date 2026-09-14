// Staff module — public API (TASK-476, plan 181)
export { StaffModule } from './staff.module';
export {
  StaffService,
  type PaginatedStaffResponse,
  type StaffPermissionChange,
} from './staff.service';
export { StaffController } from './staff.controller';
export {
  StaffRepository,
  STAFF_ROLES,
  type CreateStaffUserInput,
  type FindStaffParams,
  type StaffAccount,
  type PaginatedStaffResult,
} from './staff.repository';
export { StaffUserEntity, StaffPermissionsEntity } from './entities';
export {
  CreateStaffDto,
  SetStaffPasswordDto,
  StaffListQueryDto,
  UpdateStaffPermissionsDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './dto';
