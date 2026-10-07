import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * The category a delete creates on the spot to receive the deleted subtree's
 * products (TASK-652, decision B-2 of plan 178 — the admin dialog's mini-form).
 *
 * Only a name and a parent: the slug is generated from the name exactly as a
 * normal create does, and everything else (description, SEO, image) can be filled
 * in afterwards through the regular edit form. Creating the target additionally
 * requires `categories:write` — checked in the service, because it depends on the
 * body rather than on the route.
 */
export class DeleteCategoryMoveToNewDto {
  @ApiProperty({
    description: 'Name of the category to create and move the products into',
    example: 'Інші аксесуари',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Category name must not be empty' })
  @MaxLength(255, { message: 'Category name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description:
      'Parent of the new category (null or absent = a root category). Must be a live ' +
      'category outside the subtree being deleted.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Parent ID must be a valid UUID' })
  parentId?: string | null;
}

/**
 * Body of `DELETE /api/admin/categories/:id` (TASK-652).
 *
 * Deleting a category tombstones its WHOLE subtree and first moves every product
 * filed anywhere in it — active, inactive and soft-deleted alike — into ONE target
 * category outside that subtree. Products are never deleted or deactivated with
 * their category (decision B-2 of plan 178).
 *
 * AT MOST ONE of `moveToId` / `moveToNew` may be sent. Sending NEITHER (an empty or
 * absent body — TASK-655) deletes a truly empty category: no live subcategory, no
 * product of any state (soft-deleted ones included) and no carousel; anything else is
 * refused. Both rules are checked by `CategoryService` / `CategoryRepository` (400
 * `CATEGORY_MOVE_TARGET_REQUIRED`) rather than here, so the response carries the stable
 * error code the admin panel keys its announcement off.
 *
 * `allowHiddenTarget` (TASK-1837) is the operator's explicit consent to move the
 * products into a HIDDEN (`isActive = false`) existing target — a product is public only
 * while its own category is active, so such a move takes them off the storefront.
 * Without it the repository refuses a hidden target with 409
 * `CATEGORY_MOVE_TARGET_HIDDEN`, decided under the tree lock, so a target hidden after
 * the dialog loaded never silently hides the products.
 */
export class DeleteCategoryDto {
  @ApiProperty({
    description:
      'Move the products into this EXISTING live category. Must be outside the subtree ' +
      'being deleted. Mutually exclusive with `moveToNew`; omit both only for a truly ' +
      'empty category (no subcategory, no product — deleted ones included — no carousel).',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'moveToId must be a valid UUID' })
  moveToId?: string;

  @ApiProperty({
    description:
      'Create a new category and move the products into it (requires `categories:write` ' +
      'in addition to the delete permission). Mutually exclusive with `moveToId`; omit ' +
      'both only for a truly empty category.',
    type: () => DeleteCategoryMoveToNewDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeleteCategoryMoveToNewDto)
  moveToNew?: DeleteCategoryMoveToNewDto;

  @ApiProperty({
    description:
      'Consent to move the products into a HIDDEN (inactive) `moveToId` target — they ' +
      'then disappear from the storefront until that category is shown again. Without ' +
      'it a hidden target is refused with 409 `CATEGORY_MOVE_TARGET_HIDDEN` and nothing ' +
      'changes. Ignored for `moveToNew` (the new category is always created active).',
    example: true,
    required: false,
    type: Boolean,
  })
  @IsOptional()
  // The RAW value, not the implicitly converted one: with `enableImplicitConversion` a
  // string "false" would become `true` — and this flag is consent, so only a real
  // boolean counts.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean({ message: 'allowHiddenTarget must be true or false' })
  allowHiddenTarget?: boolean;
}
