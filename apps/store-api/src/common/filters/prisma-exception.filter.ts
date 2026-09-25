import { Catch } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * Global filter for Prisma failures (TASK-574), registered as `APP_FILTER` in
 * `AppModule` so it is live under `Test.createTestingModule` too — the e2e
 * suites never run `main.ts`.
 *
 * It is {@link HttpExceptionFilter} narrowed by `@Catch`: the envelope, the
 * logging and the Sentry rule are inherited, not copied. HttpExceptionFilter
 * itself runs every exception through {@link translatePrismaError} (`prisma-error.translator.ts`) as well,
 * which is what makes the ORDER of the two filters irrelevant. It matters,
 * because Nest tries global filters last-registered-first and `main.ts` adds
 * the catch-all HttpExceptionFilter AFTER every `APP_FILTER` — so in production
 * the catch-all sees a Prisma error first, and without its own translation it
 * would answer 500 no matter what this class said.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter extends HttpExceptionFilter {}
