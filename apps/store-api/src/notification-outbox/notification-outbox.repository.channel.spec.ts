import { NotificationChannel } from '@prisma/client';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { PrismaService } from '../prisma';

/**
 * `enqueue` and the `channel` column (TASK-673). The existing callers never pass
 * a channel and must keep writing exactly what they wrote before (pinned in
 * `notification-outbox.repository.spec.ts`); an explicit channel is forwarded.
 */
describe('NotificationOutboxRepository.enqueue — channel', () => {
  const prismaMock = { notificationOutbox: { create: jest.fn() } };
  const repository = new NotificationOutboxRepository(prismaMock as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.notificationOutbox.create.mockResolvedValue({ id: 'row-1' });
  });

  it('forwards an explicit channel to the insert', async () => {
    await repository.enqueue({
      type: 'order-confirmation',
      channel: NotificationChannel.TELEGRAM,
      recipientAddress: '123456789',
      payload: { orderId: 'o-1' },
    });

    expect(prismaMock.notificationOutbox.create).toHaveBeenCalledWith({
      data: {
        type: 'order-confirmation',
        channel: NotificationChannel.TELEGRAM,
        recipientAddress: '123456789',
        payload: { orderId: 'o-1' },
      },
    });
  });

  it('leaves the channel to the column default (EMAIL) when none is given', async () => {
    await repository.enqueue({
      type: 'order-confirmation',
      recipientAddress: 'buyer@example.com',
      payload: {},
    });

    const [{ data }] = prismaMock.notificationOutbox.create.mock.calls[0];
    expect(data).not.toHaveProperty('channel');
  });
});
