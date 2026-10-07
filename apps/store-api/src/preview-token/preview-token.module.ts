import { Module } from '@nestjs/common';
import { PreviewTokenRepository } from './preview-token.repository';
import { PreviewTokenService } from './preview-token.service';
import { AdminPreviewTokenController, PreviewTokenController } from './preview-token.controller';

/**
 * Signed preview links (TASK-668, plan 186). Exports the service so the public reads
 * that honour a token (home blocks, banners, product, page, blog post) can check one.
 * Depends on nothing but Prisma and the (global) permission module, so every content
 * module can import it without a cycle.
 */
@Module({
  controllers: [AdminPreviewTokenController, PreviewTokenController],
  providers: [PreviewTokenRepository, PreviewTokenService],
  exports: [PreviewTokenService],
})
export class PreviewTokenModule {}
