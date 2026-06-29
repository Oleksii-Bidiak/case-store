import { Module } from '@nestjs/common';
import { PageRepository } from './pages.repository';
import { PageService } from './pages.service';
import { PageController } from './pages.controller';
import { AdminPageController } from './admin-pages.controller';

@Module({
  controllers: [PageController, AdminPageController],
  providers: [PageRepository, PageService],
  exports: [PageService],
})
export class PagesModule {}
