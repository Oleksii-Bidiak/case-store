import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as Sentry from '@sentry/nestjs';
import { HttpExceptionFilter } from './http-exception.filter';

// Sentry is stubbed so the spec asserts capture behaviour without any DSN/network.
jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let logger: { setContext: jest.Mock; error: jest.Mock };
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const captureException = Sentry.captureException as jest.Mock;

  function createHost(url = '/api/test', method = 'GET'): ArgumentsHost {
    const response = { status: statusMock, json: jsonMock };
    const request = { url, method };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    logger = { setContext: jest.fn(), error: jest.fn() };
    filter = new HttpExceptionFilter(logger as unknown as PinoLogger);
    captureException.mockClear();
  });

  it('returns the standard error envelope for an HttpException', () => {
    filter.catch(new BadRequestException('bad input'), createHost('/api/x', 'POST'));

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = jsonMock.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'bad input',
      path: '/api/x',
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('does NOT send 4xx client/validation errors to Sentry', () => {
    filter.catch(new BadRequestException(['field must not be empty']), createHost());

    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends explicit 5xx HttpExceptions to Sentry with request tags', () => {
    filter.catch(new InternalServerErrorException('boom'), createHost('/api/orders', 'POST'));

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [captured, context] = captureException.mock.calls[0];
    expect(captured).toBeInstanceOf(HttpException);
    expect(context).toEqual({ tags: { path: '/api/orders', method: 'POST' } });
  });

  it('sends unhandled (non-HTTP) exceptions to Sentry and returns a 500 envelope', () => {
    const bug = new Error('unexpected');
    filter.catch(bug, createHost('/api/boom', 'GET'));

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(logger.error).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(bug);

    const body = jsonMock.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Internal server error',
    });
  });
});
