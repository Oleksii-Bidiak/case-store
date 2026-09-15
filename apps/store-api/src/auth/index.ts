// Auth Module — public API
export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
export { AuthController } from './auth.controller';
export { AuthRepository } from './auth.repository';
export { AuthTokens } from './entities';

// DTOs
export { RegisterDto } from './dto/register.dto';
export { LoginDto } from './dto/login.dto';

// Guards. `RolesGuard` and `AdminGuard` were deleted in TASK-475 — both
// predated `PermissionGuard` and neither could express the access model: one
// let through ANY authenticated caller when no `@Roles` metadata was present,
// the other hardcoded `role !== ADMIN` and so refused a manager the owner had
// deliberately granted the route.
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { JwtRefreshGuard } from './guards/jwt-refresh.guard';
export { PermissionGuard } from './permissions/permission.guard';

// RBAC (TASK-334 / TASK-475)
export {
  PermissionModule,
  PermissionService,
  PermissionRepository,
  RequirePermission,
  OwnerOnly,
  PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  isGrantablePermission,
  isKnownPermission,
  type Permission,
  type PermissionActor,
} from './permissions';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator';

// Strategies
export { JwtAccessStrategy } from './strategies/jwt-access.strategy';
export { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
