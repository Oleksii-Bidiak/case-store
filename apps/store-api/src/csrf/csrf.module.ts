import { Module } from '@nestjs/common';
import { CsrfController } from './csrf.controller';
import { CsrfService } from './csrf.service';

/**
 * CSRF protection module.
 *
 * Exposes `GET /api/csrf-token` and provides `CsrfService`, whose `protect`
 * middleware is wired onto the cookie-authenticated state-changing routes in
 * `main.ts` (Express layer, via `app.get(CsrfService)`).
 */
@Module({
  controllers: [CsrfController],
  providers: [CsrfService],
  exports: [CsrfService],
})
export class CsrfModule {}
