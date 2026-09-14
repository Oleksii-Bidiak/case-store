// Staff module — public API (TASK-476, plan 181)
export { StaffModule } from './staff.module';
export { StaffService, type PaginatedStaffResponse } from './staff.service';
export { StaffController } from './staff.controller';
export {
  StaffRepository,
  STAFF_ROLES,
  type CreateStaffUserInput,
  type FindStaffParams,
  type StaffAccount,
  type PaginatedStaffResult,
} from './staff.repository';
export { StaffUserEntity } from './entities';
export {
  CreateStaffDto,
  SetStaffPasswordDto,
  StaffListQueryDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './dto';
