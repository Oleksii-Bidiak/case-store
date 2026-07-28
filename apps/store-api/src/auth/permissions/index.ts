export {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_ZONES,
  PERMISSION_ZONE_LABELS,
  isKnownPermission,
  type Permission,
  type PermissionDefinition,
  type PermissionZone,
} from './permission.catalog';
export {
  RequirePermission,
  OwnerOnly,
  REQUIRE_PERMISSION_KEY,
  OWNER_ONLY_KEY,
} from './require-permission.decorator';
export { PermissionGuard } from './permission.guard';
export { PermissionService, type EffectivePermissions } from './permission.service';
export { PermissionRepository, type PermissionActor } from './permission.repository';
export { PermissionModule } from './permission.module';
