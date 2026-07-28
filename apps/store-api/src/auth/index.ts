// Auth Module — public API
export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
export { AuthController } from './auth.controller';
export { AuthRepository } from './auth.repository';
export { AuthTokens } from './entities';

// DTOs
export { RegisterDto } from './dto/register.dto';
export { LoginDto } from './dto/login.dto';

// Guards
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { JwtRefreshGuard } from './guards/jwt-refresh.guard';
export { RolesGuard } from './guards/roles.guard';
export { AdminGuard } from './guards/admin.guard';
export { PermissionGuard } from './permissions/permission.guard';

// RBAC (TASK-334)
export {
  PermissionModule,
  PermissionService,
  PermissionRepository,
  RequirePermission,
  OwnerOnly,
  PERMISSIONS,
  isKnownPermission,
  type Permission,
  type PermissionActor,
} from './permissions';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';

// Strategies
export { JwtAccessStrategy } from './strategies/jwt-access.strategy';
export { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
