// Staff module — public API (TASK-476, plan 181)
export { StaffModule } from './staff.module';
export { StaffService, type StaffPermissionChange, type OwnershipTransfer } from './staff.service';
export { StaffUserEntity, StaffPermissionsEntity, OwnershipTransferEntity } from './entities';
export {
  CreateStaffDto,
  SetStaffPasswordDto,
  StaffListQueryDto,
  TransferOwnershipDto,
  UpdateStaffPermissionsDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './dto';
