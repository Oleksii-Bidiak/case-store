import { Module } from '@nestjs/common';
import { FaqRepository } from './faq.repository';
import { FaqService } from './faq.service';
import { FaqController } from './faq.controller';
import { AdminFaqController } from './admin-faq.controller';

/**
 * FaqModule — global, admin-editable FAQ list (TASK-242).
 *
 * `RevalidationNotifier` is injected into the service from the `@Global()`
 * PublishingModule, so this module does not import it explicitly.
 */
@Module({
  controllers: [FaqController, AdminFaqController],
  providers: [FaqRepository, FaqService],
  exports: [FaqService],
})
export class FaqModule {}
