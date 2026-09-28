import { Module } from '@nestjs/common';
import { NovaPoshtaClient } from './nova-poshta.client';
import { DeliveryRepository } from './delivery.repository';
import { PickupPointRepository } from './pickup-point.repository';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { AdminDeliveryController } from './admin-delivery.controller';

/**
 * DeliveryModule — Nova Poshta delivery proxy + the admin dispatch-origin settings.
 *
 * `CacheService` is available app-wide (RedisCacheModule is `@Global`) and
 * `PrismaService` likewise, so this module only registers its own
 * client/repository/service. `DeliveryService` is exported so `OrderModule` can
 * compute `shippingCost` at order creation (TASK-080-B) and, since TASK-643,
 * validate and price every delivery method there.
 */
@Module({
  controllers: [DeliveryController, AdminDeliveryController],
  // TASK-643: PickupPointRepository backs the public methods list and the
  // order-time pickup check (through DeliveryService, never exported directly).
  providers: [NovaPoshtaClient, DeliveryRepository, PickupPointRepository, DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
