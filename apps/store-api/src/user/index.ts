// User Module — public API
export { UserModule } from './user.module';
export { UserService } from './user.service';
export {
  UserRepository,
  type UpdateUserInput,
  type FindAllParams,
  type PaginatedUsersResult,
} from './user.repository';
export { UserEntity } from './entities';
export { UpdateProfileDto, UserListQueryDto } from './dto';
