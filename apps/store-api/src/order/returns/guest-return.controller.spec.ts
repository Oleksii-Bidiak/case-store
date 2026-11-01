import 'reflect-metadata';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
// Deep import, like `newsletter.controller.spec.ts`: the package barrel does not
// export the metadata keys.
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { FAIL_CLOSED_THROTTLE_KEY } from '../../throttler/fail-closed-throttle.decorator';
import { OrderService } from '../order.service';
import { GuestReturnController } from './guest-return.controller';
import { ReturnService } from './return.service';

/**
 * TASK-1965 — the guest's door onto returns, `/orders/guest/:token/returns`.
 *
 * The token is the credential, so the controller's whole job is the order of
 * two calls: prove the token (OrderService, the same resolution as the guest
 * order read), and only then touch returns with the id it proved.
 */
describe('GuestReturnController (TASK-1965)', () => {
  const TOKEN = 'e'.repeat(64);
  const ORDER_ID = 'order-uuid-1';
  const dto = { items: [{ orderItemId: 'line-1', quantity: 1 }] };

  const orderServiceMock = { resolveGuestOrderId: jest.fn() };
  const returnServiceMock = { createGuestReturn: jest.fn(), getGuestOrderReturns: jest.fn() };

  let controller: GuestReturnController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestReturnController],
      providers: [
        { provide: OrderService, useValue: orderServiceMock },
        { provide: ReturnService, useValue: returnServiceMock },
      ],
    }).compile();
    controller = module.get(GuestReturnController);
  });

  it('creates against the order the token proves, wrapped in { data }', async () => {
    orderServiceMock.resolveGuestOrderId.mockResolvedValue(ORDER_ID);
    returnServiceMock.createGuestReturn.mockResolvedValue({ id: 'return-1' });

    await expect(controller.create(TOKEN, dto)).resolves.toEqual({ data: { id: 'return-1' } });
    expect(orderServiceMock.resolveGuestOrderId).toHaveBeenCalledWith(TOKEN);
    expect(returnServiceMock.createGuestReturn).toHaveBeenCalledWith(ORDER_ID, dto);
  });

  it('lists the returns of the order the token proves', async () => {
    orderServiceMock.resolveGuestOrderId.mockResolvedValue(ORDER_ID);
    returnServiceMock.getGuestOrderReturns.mockResolvedValue([]);

    await expect(controller.list(TOKEN)).resolves.toEqual({ data: [] });
    expect(returnServiceMock.getGuestOrderReturns).toHaveBeenCalledWith(ORDER_ID);
  });

  it('touches no return when the token does not resolve', async () => {
    orderServiceMock.resolveGuestOrderId.mockRejectedValue(
      new NotFoundException('Order not found'),
    );

    await expect(controller.create(TOKEN, dto)).rejects.toThrow(NotFoundException);
    await expect(controller.list(TOKEN)).rejects.toThrow(NotFoundException);
    expect(returnServiceMock.createGuestReturn).not.toHaveBeenCalled();
    expect(returnServiceMock.getGuestOrderReturns).not.toHaveBeenCalled();
  });

  describe('route wiring', () => {
    const limitOf = (handler: unknown) =>
      Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler as object);
    const ttlOf = (handler: unknown) =>
      Reflect.getMetadata(`${THROTTLER_TTL}default`, handler as object);

    it('caps the read at 20 a minute and the write at 5', () => {
      expect(limitOf(GuestReturnController.prototype.list)).toBe(20);
      expect(ttlOf(GuestReturnController.prototype.list)).toBe(60000);
      expect(limitOf(GuestReturnController.prototype.create)).toBe(5);
      expect(ttlOf(GuestReturnController.prototype.create)).toBe(60000);
    });

    it('fails closed on both — the path segment is the credential', () => {
      expect(
        Reflect.getMetadata(FAIL_CLOSED_THROTTLE_KEY, GuestReturnController.prototype.list),
      ).toBe(true);
      expect(
        Reflect.getMetadata(FAIL_CLOSED_THROTTLE_KEY, GuestReturnController.prototype.create),
      ).toBe(true);
    });

    it('answers a created return with 201', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, GuestReturnController.prototype.create)).toBe(
        HttpStatus.CREATED,
      );
    });

    it('carries no auth guard — the token is the only proof a guest has', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, GuestReturnController)).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, GuestReturnController.prototype.list),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, GuestReturnController.prototype.create),
      ).toBeUndefined();
    });
  });
});
