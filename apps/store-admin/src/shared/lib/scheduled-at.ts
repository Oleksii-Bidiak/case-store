import { fromKyivDateTimeLocal } from "./format/datetime-local";

/**
 * True when a `datetime-local` value (Kyiv wall clock) is a moment that has
 * already come — `now` or earlier. Unparseable or empty values are `false`:
 * "required" is the caller's own rule.
 *
 * Why the publish forms refuse it (TASK-1984, forms Rule 5e): the API's
 * `resolvePublishState` does not reject a SCHEDULED row with a past
 * `scheduledAt`, it silently publishes it NOW — so an operator who typed last
 * week's date by mistake would see the page go live without being asked.
 *
 * Import directly (not via the barrel), like the other form helpers.
 */
export function isPastKyivDateTimeLocal(
  value: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!value) return false;
  const at = fromKyivDateTimeLocal(value);
  return at !== null && at.getTime() <= now.getTime();
}
