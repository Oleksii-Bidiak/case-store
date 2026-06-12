import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  controllers: [UserController],
  providers: [UserRepository, UserService],
  // UserRepository is exported so OrderModule can look up a recipient's email
  // when dispatching the order-confirmation email (TASK-037).
  exports: [UserService, UserRepository],
})
export class UserModule {}
