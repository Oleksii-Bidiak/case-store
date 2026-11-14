/**
 * A class-transformer `@Transform` that trims a string and leaves anything else
 * as it came (so `@IsString()` still refuses a number, and `@IsOptional()` still
 * sees `undefined` / `null`).
 *
 * Paired with `@IsNotEmpty()` it makes a required name refuse `"   "` the same
 * way the admin forms do with zod's `trim().min(1)` (TASK-1984, forms Rule 5d).
 */
export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
