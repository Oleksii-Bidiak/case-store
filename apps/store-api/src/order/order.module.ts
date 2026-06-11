import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [CartModule],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
