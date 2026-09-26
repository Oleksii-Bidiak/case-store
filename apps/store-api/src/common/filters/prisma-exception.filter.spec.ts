import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import * as Sentry from '@sentry/nestjs';
import { HttpExceptionFilter } from './http-exception.filter';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { PRISMA_ERROR_CODES, translatePrismaError } from './prisma-error.translator';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

const CLIENT_VERSION = '7.9.1';

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`Prisma failure ${code}`, {
    code,
    clientVersion: CLIENT_VERSION,
    meta,
  });
}

/**
 * The validation error Prisma really throws quotes the whole query — this text
 * stands in for it, and must never reach a response body.
 */
const VALIDATION_TEXT =
  'Invalid `prisma.product.update()` invocation:\n{ data: { keywords: null } }\nArgument `keywords` must not be null.';

describe('translatePrismaError (TASK-574)', () => {
  it.each([
    ['P2002', HttpStatus.CONFLICT, PRISMA_ERROR_CODES.uniqueViolation],
    ['P2025', HttpStatus.NOT_FOUND, PRISMA_ERROR_CODES.notFound],
    ['P2003', HttpStatus.CONFLICT, PRISMA_ERROR_CODES.foreignKeyViolation],
  ])('maps %s to %d with the stable code %s', (code, status, errorCode) => {
    const translated = translatePrismaError(known(code));

    expect(translated?.getStatus()).toBe(status);
    expect(translated?.getResponse()).toMatchObject({ error: errorCode });
  });

  it('maps a PrismaClientValidationError to 400', () => {
    const translated = translatePrismaError(
      new Prisma.PrismaClientValidationError(VALIDATION_TEXT, { clientVersion: CLIENT_VERSION }),
    );

    expect(translated?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(translated?.getResponse()).toMatchObject({ error: PRISMA_ERROR_CODES.invalidQuery });
  });

  it.each(['P2034', 'P1001', 'P2024'])(
    'leaves %s alone — server-side trouble stays 500',
    (code) => {
      expect(translatePrismaError(known(code))).toBeNull();
    },
  );

  it('leaves non-Prisma errors alone', () => {
    expect(translatePrismaError(new Error('boom'))).toBeNull();
    expect(translatePrismaError('string')).toBeNull();
  });
});

describe.each([
  ['PrismaExceptionFilter', PrismaExceptionFilter],
  // The ordering case: main.ts registers this catch-all after every APP_FILTER,
  // so in production IT is the filter that sees a Prisma error first.
  ['HttpExceptionFilter (catch-all)', HttpExceptionFilter],
])('%s answers a Prisma failure as a 4xx envelope', (_name, FilterClass) => {
  let filter: HttpExceptionFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let logger: { setContext: jest.Mock; error: jest.Mock; warn: jest.Mock };
  const captureException = Sentry.captureException as jest.Mock;

  function host(): ArgumentsHost {
    const response = { status: statusMock, json: jsonMock };
    const request = { url: '/api/admin/staff/x/transfer-ownership', method: 'POST' };
    return {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };
    filter = new FilterClass(logger as unknown as PinoLogger);
    captureException.mockClear();
  });

  it('P2002 → 409 { statusCode, error, message } with no schema names in the body', () => {
    filter.catch(known('P2002', { target: ['is_owner'], modelName: 'User' }), host());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = jsonMock.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      error: PRISMA_ERROR_CODES.uniqueViolation,
    });
    expect(typeof body.message).toBe('string');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('is_owner');
    expect(serialized).not.toContain('User');
    expect(serialized).not.toContain('P2002');
  });

  it('never echoes the query text of a validation error', () => {
    filter.catch(
      new Prisma.PrismaClientValidationError(VALIDATION_TEXT, { clientVersion: CLIENT_VERSION }),
      host(),
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const serialized = JSON.stringify(jsonMock.mock.calls[0][0]);
    expect(serialized).not.toContain('keywords');
    expect(serialized).not.toContain('prisma.product');
  });

  it('logs the original for the operator and does not page Sentry for a client error', () => {
    filter.catch(known('P2025'), host());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'prisma.errorTranslated', prismaCode: 'P2025' }),
      expect.any(String),
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('HttpExceptionFilter — an untranslated Prisma error is still a 500', () => {
  it('reports P2034 (write conflict) as a server fault', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const filter = new HttpExceptionFilter(logger as unknown as PinoLogger);

    filter.catch(known('P2034'), {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock, json: jsonMock }),
        getRequest: () => ({ url: '/api/x', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
