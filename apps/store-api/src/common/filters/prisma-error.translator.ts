import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Stable machine codes for the `error` field of a translated Prisma failure.
 * Clients branch on these, never on the human `message`.
 */
export const PRISMA_ERROR_CODES = {
  uniqueViolation: 'UNIQUE_CONSTRAINT_VIOLATION',
  notFound: 'RECORD_NOT_FOUND',
  foreignKeyViolation: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
  invalidQuery: 'INVALID_QUERY',
} as const;

/**
 * Translate a Prisma failure that leaked past the service layer into the 4xx it
 * actually is (TASK-574) — or `null` for anything this does not own.
 *
 * ── Why a global translation and not try/catch at each call site ─────────────
 * Most services already catch the cases they expect (`P2002` on a slug, a cart
 * line, a review). The defect was the ones nobody expected: two simultaneous
 * ownership transfers collide on the partial unique index and the owner saw
 * HTTP 500 (TASK-636); a `keywords: null` that slipped past a DTO answered 500
 * with Prisma's own query dump in the log. Neither is a server fault, and a 500
 * both hides that from the client and pages whoever watches Sentry.
 *
 * ── What is deliberately NOT in the response ──────────────────────────────────
 * `meta.target` (column and constraint names), `meta.modelName`, and the text
 * of a `PrismaClientValidationError` — which quotes the whole query, argument by
 * argument. The body says what kind of conflict happened and nothing about the
 * schema behind it. The full error is still logged server-side by the filter.
 *
 * Messages are Ukrainian because both frontends render the API's `message`
 * verbatim in a toast (`apiErrorMessage`), and the people reading those toasts
 * are the shop's operators and shoppers.
 *
 * Codes outside this table (`P2034` write conflict, connection errors, …) stay
 * 500: they are server-side trouble, and turning them into a 4xx would tell the
 * client the request was its fault.
 */
export function translatePrismaError(exception: unknown): HttpException | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      // Unique constraint failed.
      case 'P2002':
        return new ConflictException({
          error: PRISMA_ERROR_CODES.uniqueViolation,
          message:
            'Такий запис уже існує або його щойно змінили паралельно. Оновіть сторінку й спробуйте ще раз.',
        });
      // "An operation failed because it depends on one or more records that
      // were required but not found" — update/delete of a row that is gone.
      case 'P2025':
        return new NotFoundException({
          error: PRISMA_ERROR_CODES.notFound,
          message: 'Запис не знайдено — можливо, його щойно видалили.',
        });
      // Foreign key constraint failed: the row is still referenced, or refers
      // to one that does not exist.
      case 'P2003':
        return new ConflictException({
          error: PRISMA_ERROR_CODES.foreignKeyViolation,
          message: "Операцію відхилено: запис пов'язаний з іншими даними.",
        });
      default:
        return null;
    }
  }

  if (exception instanceof Prisma.PrismaClientValidationError) {
    return new BadRequestException({
      error: PRISMA_ERROR_CODES.invalidQuery,
      message: 'Некоректні дані запиту.',
    });
  }

  return null;
}
