import { Module } from '@nestjs/common';
import { CarouselsModule } from '../carousels';
import { PUBLISHABLE_REPOSITORY } from '../publishing';
import { HomeBlockRepository } from './home-block.repository';
import { HomeBlockService } from './home-block.service';
import { HomeBlockController } from './home-block.controller';
import { AdminHomeBlockController } from './admin-home-block.controller';

/**
 * The homepage as a list of blocks (TASK-660 / TASK-661, plan 186).
 */
@Module({
  imports: [CarouselsModule],
  controllers: [HomeBlockController, AdminHomeBlockController],
  providers: [
    HomeBlockRepository,
    HomeBlockService,
    // A SCHEDULED block goes live on the PublishingScheduler's tick, like banners and
    // carousels — one `useExisting` alias per content module (see PUBLISHABLE_REPOSITORY).
    { provide: PUBLISHABLE_REPOSITORY, useExisting: HomeBlockRepository },
  ],
  exports: [HomeBlockService],
})
export class HomeBlockModule {}
