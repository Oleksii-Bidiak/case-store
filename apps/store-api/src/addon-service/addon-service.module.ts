import { Module } from '@nestjs/common';
import { AddonServiceRepository } from './addon-service.repository';
import { AddonApplicabilityResolver } from './addon-applicability.resolver';
import { AddonServiceService } from './addon-service.service';
import { AddonServiceController } from './addon-service.controller';
import { AdminAddonServiceController } from './admin-addon-service.controller';
import { CategoryModule } from '../category';
import { ProductModule } from '../product';

/**
 * Add-on services / protection plans (TASK-174, plan 150).
 *
 * Imports `CategoryModule` for the ordered ancestor-chain traversal that backs
 * nearest-ancestor-wins template resolution, and `ProductModule` to look up a
 * product's category. Exports {@link AddonApplicabilityResolver} (and the
 * repository) so `CartModule`/`OrderModule` can resolve and persist a line's
 * add-ons without re-providing a second instance.
 */
@Module({
  imports: [CategoryModule, ProductModule],
  controllers: [AddonServiceController, AdminAddonServiceController],
  providers: [AddonServiceRepository, AddonApplicabilityResolver, AddonServiceService],
  exports: [AddonApplicabilityResolver, AddonServiceRepository, AddonServiceService],
})
export class AddonServiceModule {}
