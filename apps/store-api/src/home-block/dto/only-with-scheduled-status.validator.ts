import { PublishStatus } from '@prisma/client';
import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Rejects `scheduledAt` unless the same body sets `status: 'SCHEDULED'` (TASK-661, S3).
 * A date sent without it would otherwise be dropped silently — see
 * `HomeBlockPublishFieldsDto`.
 */
export function OnlyWithScheduledStatus(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'onlyWithScheduledStatus',
      target: object.constructor,
      propertyName,
      options: {
        message: 'scheduledAt is only allowed together with status SCHEDULED',
        ...options,
      },
      validator: {
        validate(_value: unknown, args): boolean {
          return (args?.object as { status?: unknown }).status === PublishStatus.SCHEDULED;
        },
      },
    });
  };
}
