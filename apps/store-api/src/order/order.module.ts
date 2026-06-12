import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { UserModule } from '../user';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  // UserModule provides UserRepository (recipient lookup for confirmation
  // email). MailService comes from the global MailModule, so it is not listed
  // here.
  imports: [CartModule, UserModule],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
