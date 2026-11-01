import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, ValidateIf } from 'class-validator';

/**
 * The category icon set (TASK-1956, style «Дуотон» chosen 2026-10-30): every key here
 * is a `<symbol id>` in the storefront SVG sprite `store-client/public/icons/categories.svg`
 * (mirrored in `store-admin/public/icons/`).
 *
 * `Category.icon` is a plain string column, not a Postgres enum, so a new icon is a
 * `chore` in code — draw it in the same style, add the symbol to both sprites, append the
 * key here — and needs no migration. The sprite's own `folder` (no icon / unknown key)
 * and `all` («Усі категорії») symbols are deliberately NOT keys: an admin cannot pick them.
 */
export const CATEGORY_ICON_KEYS = [
  'cases',
  'glass',
  'chargers',
  'cables',
  'power-banks',
  'headphones',
  'watches',
  'speakers',
  'holders',
  'smartphones',
  'memory',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

const ICON_KEY_SET: ReadonlySet<string> = new Set(CATEGORY_ICON_KEYS);

/**
 * Narrows a stored `Category.icon` to the response contract: a key that left the set
 * (an icon retired from the sprite after an admin picked it) reads as `null`, so the
 * `CategoryIcon` enum the clients are generated from never lies. The column itself is
 * left alone — re-adding the key brings the icon back.
 */
export function toCategoryIconKey(value: string | null | undefined): CategoryIconKey | null {
  return value != null && ICON_KEY_SET.has(value) ? (value as CategoryIconKey) : null;
}

/** Shared OpenAPI metadata, so every request and response field emits one `CategoryIcon` enum. */
export const CATEGORY_ICON_API_PROPERTY = {
  description:
    'Category icon — a key into the storefront SVG sprite (TASK-1956). Null means no icon: ' +
    'clients render the generic «folder» glyph. Send null to clear.',
  enum: [...CATEGORY_ICON_KEYS],
  enumName: 'CategoryIcon',
  example: 'cases',
  required: false,
  nullable: true,
};

/**
 * The `icon` field of the category create/update DTOs. Absent leaves the stored icon
 * alone, explicit `null` clears it (back to «folder»), anything else must be one of
 * {@link CATEGORY_ICON_KEYS} — an unknown key is a 400, never stored.
 */
export function IsCategoryIconField(): PropertyDecorator {
  return applyDecorators(
    ApiProperty(CATEGORY_ICON_API_PROPERTY),
    IsOptional(),
    ValidateIf((_, value) => value !== null),
    IsIn([...CATEGORY_ICON_KEYS], {
      message: `icon must be one of: ${CATEGORY_ICON_KEYS.join(', ')}`,
    }),
  );
}
