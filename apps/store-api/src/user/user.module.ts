import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '../auth';
import { ReviewModule } from '../review/review.module';
import { DiscountModule } from '../discount';

@Module({
  // AuthModule exports AuthRepository, which UserService uses to revoke a
  // banned user's refresh tokens on deactivation (TASK-062).
  //
  // ReviewModule exports ReviewService, which the same ban uses to withdraw the
  // account's ratings and texts (TASK-589). Imported from the leaf module file
  // rather than the barrel: `../review` re-exports the controllers and entities
  // too, and this module needs none of them.
  //
  // DiscountModule exports DiscountService, which supplies the customer card's
  // redeemed coupons (TASK-827). It does not import this module back.
  imports: [AuthModule, ReviewModule, DiscountModule],
  controllers: [UserController],
  providers: [UserRepository, UserService],
  // UserRepository is exported so OrderModule can look up a recipient's email
  // when dispatching the order-confirmation email (TASK-037).
  exports: [UserService, UserRepository],
})
export class UserModule {}
