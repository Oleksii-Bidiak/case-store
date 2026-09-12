import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Cross-field rule for a banner's publication window (TASK-429).
 *
 * `scheduledUntil` is the instant the PublishingScheduler takes the banner back
 * down. When the banner also names a start (`scheduledAt`, i.e. a SCHEDULED
 * banner), the end must fall strictly AFTER it — an end before the start is not a
 * window, it is a banner that would be published and unpublished on the same tick,
 * which reads to the operator as "scheduling is broken".
 *
 * Why this lives on the DTO and not only in the admin form: the form is one
 * client. The rule has to hold for anything that can PUT a banner, and a rule that
 * exists only in the UI is a rule the next client does not have.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * - Absent / empty values pass: optionality is `@IsOptional()`'s job, and a
 *   missing end simply means "no end".
 * - Unparseable values pass: `@IsDateString()` on each field already reports the
 *   format, and a second error on the same input only muddies the response.
 * - "The end must be in the future" is NOT enforced. It would need a clock in the
 *   validator, and it would make an already-expired banner un-editable — every
 *   save would bounce on a date the operator is not necessarily touching. Expiry
 *   has exactly one owner: the scheduler, which takes such a banner down on its
 *   next tick.
 *
 * Applied to `scheduledUntil` (not to `scheduledAt`) so the error lands on the
 * field the operator just typed.
 */
@ValidatorConstraint({ name: 'bannerPublicationWindow', async: false })
export class PublicationWindowConstraint implements ValidatorConstraintInterface {
  validate(scheduledUntil: unknown, args: ValidationArguments): boolean {
    if (typeof scheduledUntil !== 'string' || scheduledUntil === '') return true;

    const { scheduledAt } = args.object as { scheduledAt?: unknown };
    if (typeof scheduledAt !== 'string' || scheduledAt === '') return true;

    const start = Date.parse(scheduledAt);
    const end = Date.parse(scheduledUntil);
    if (Number.isNaN(start) || Number.isNaN(end)) return true;

    return end > start;
  }

  defaultMessage(): string {
    return 'scheduledUntil must be later than scheduledAt';
  }
}
