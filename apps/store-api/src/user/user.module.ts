import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '../auth';

@Module({
  // AuthModule exports AuthRepository, which UserService uses to revoke a
  // banned user's refresh tokens on deactivation (TASK-062).
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserRepository, UserService],
  // UserRepository is exported so OrderModule can look up a recipient's email
  // when dispatching the order-confirmation email (TASK-037).
  exports: [UserService, UserRepository],
})
export class UserModule {}
