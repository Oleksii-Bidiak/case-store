import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SLUG_MAX_LENGTH } from './slug-filter.dto-util';

/**
 * How many device models one `?device=` filter may name (TASK-2077 «усі мої
 * пристрої»). The shopper's device list is unbounded in principle, but each slug
 * becomes one entry of an `IN (...)` list (and one Meilisearch `OR` term), so the
 * count is a direct multiplier on query cost — 20 is far beyond any real
 * household and still cheap.
 */
export const MAX_DEVICE_FILTER_SLUGS = 20;

/** Separator of the multi-device form: `?device=iphone-15,galaxy-s24`. */
export const DEVICE_SLUG_SEPARATOR = ',';

export const DEVICE_SLUG_LIST_MESSAGE =
  `device must be one slug or a comma-separated list of at most ${MAX_DEVICE_FILTER_SLUGS} ` +
  `slugs, each at most ${SLUG_MAX_LENGTH} characters`;

/**
 * Split the `device` filter into its slugs: trimmed, empty chunks dropped,
 * duplicates collapsed to the first occurrence. The single-slug form
 * (`?device=iphone-15`) parses to a list of one, so every existing link reads
 * exactly as before.
 *
 * Does NOT cap the count — the DTO rejects an oversized list with a 400, so by
 * the time the resolver calls this the list is already bounded.
 */
export function parseDeviceSlugs(raw?: string): string[] {
  if (typeof raw !== 'string') return [];
  const slugs = raw
    .split(DEVICE_SLUG_SEPARATOR)
    .map((slug) => slug.trim())
    .filter((slug) => slug !== '');
  return [...new Set(slugs)];
}

@ValidatorConstraint({ name: 'isDeviceSlugList', async: false })
class IsDeviceSlugListConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const slugs = parseDeviceSlugs(value);
    return (
      slugs.length <= MAX_DEVICE_FILTER_SLUGS &&
      slugs.every((slug) => slug.length <= SLUG_MAX_LENGTH)
    );
  }

  defaultMessage(): string {
    return DEVICE_SLUG_LIST_MESSAGE;
  }
}

/**
 * Validates the `device` catalogue filter: one slug, or up to
 * {@link MAX_DEVICE_FILTER_SLUGS} comma-separated slugs, each bounded by
 * {@link SLUG_MAX_LENGTH}. Slugs are not pattern-checked, for the reason given
 * on `SLUG_MAX_LENGTH`: an unknown one degrades to "ignored", never to a 400.
 *
 * Counts DISTINCT slugs — a repeated slug costs nothing downstream, so it does
 * not count against the cap.
 */
export function IsDeviceSlugList(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsDeviceSlugListConstraint,
    });
  };
}
