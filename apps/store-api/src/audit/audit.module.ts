import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Action log (TASK-318).
 *
 * `@Global()` for the same reason `MailOutboxModule` is: `AuditService.record()`
 * is a cross-cutting side effect any feature service may want (a role change, a
 * refund, a stock correction), and threading an import through twenty modules to
 * get at it would guarantee the modules that skipped the import are the ones
 * with no audit trail.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
