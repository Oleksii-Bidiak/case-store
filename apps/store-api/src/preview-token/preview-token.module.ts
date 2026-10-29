import { Module } from '@nestjs/common';
import { PermissionModule } from '../auth/permissions';
import { PreviewTokenRepository } from './preview-token.repository';
import { PreviewTokenService } from './preview-token.service';
import { AdminPreviewTokenController, PreviewTokenController } from './preview-token.controller';

/**
 * Signed preview links (TASK-668, plan 186). Exports the service so the public reads
 * that honour a token (home blocks, banners, product, page, blog post) can check one.
 * Depends on nothing but Prisma and the permission module (imported explicitly, not
 * relied on as a global, so a content module compiled on its own still resolves the
 * service), and every content module can import it without a cycle.
 */
@Module({
  imports: [PermissionModule],
  controllers: [AdminPreviewTokenController, PreviewTokenController],
  providers: [PreviewTokenRepository, PreviewTokenService],
  exports: [PreviewTokenService],
})
export class PreviewTokenModule {}
