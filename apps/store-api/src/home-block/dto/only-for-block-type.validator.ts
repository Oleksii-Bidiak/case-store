import { HomeBlockType } from '@prisma/client';
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Rejects a field that does not belong to the block `type` sent alongside it
 * (TASK-661): `carouselId` is meaningful only for CAROUSEL, `title` and `tabs` only
 * for TABS. Mirrors how `Carousel.categoryId` is tied to `source = CATEGORY`, except
 * that a stray field is a 400 here rather than silently dropped — a TABS block sent
 * with a `carouselId` is a client that misunderstood the model, and storing nothing
 * while answering 201 would hide that.
 *
 * Pair it with `@ValidateIf((o) => o.type === X || o.field !== undefined)`, so the
 * field is REQUIRED for its own type and REJECTED for any other.
 */
export function OnlyForBlockType(type: HomeBlockType, options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'onlyForBlockType',
      target: object.constructor,
      propertyName,
      constraints: [type],
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} is only allowed for ${String(args.constraints[0])} blocks`,
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          return (args.object as { type?: unknown }).type === args.constraints[0];
        },
      },
    });
  };
}
