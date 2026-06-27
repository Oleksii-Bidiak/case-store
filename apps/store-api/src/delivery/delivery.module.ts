import { Module } from '@nestjs/common';
import { NovaPoshtaClient } from './nova-poshta.client';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

/**
 * DeliveryModule — Nova Poshta delivery proxy.
 *
 * `CacheService` is available app-wide (RedisCacheModule is `@Global`), so this
 * module only needs to register its own client/service. `DeliveryService` is
 * exported so `OrderModule` can compute `shippingCost` at order creation
 * (TASK-080-B).
 */
@Module({
  controllers: [DeliveryController],
  providers: [NovaPoshtaClient, DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
