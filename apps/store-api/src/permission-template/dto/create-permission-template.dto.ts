import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `POST /api/admin/permission-templates` (TASK-477, plan 181).
 *
 * The name is required and unique because it is the whole user interface of a
 * template: on the hiring wizard the owner picks «Оператор замовлень» from a
 * list, and two entries with that label make the choice meaningless.
 *
 * `permissions` is the complete set. Which keys are acceptable is checked in the
 * service against the runtime catalogue rather than here — see
 * `UpdateStaffPermissionsDto` for why the rule is a shared function and not a
 * validator.
 */
export class CreatePermissionTemplateDto {
  @ApiProperty({ description: 'Template name, unique', example: 'Оператор замовлень' })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name!: string;

  @ApiProperty({
    description: 'What this template is for, shown next to the name',
    example: 'Телефонує клієнтам, змінює статуси замовлень',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be at most 500 characters' })
  description?: string;

  @ApiProperty({
    description:
      'The permission keys this template carries. Non-grantable keys (staff:read, staff:write, ' +
      'audit:read) are refused with 400 — a template must not be a way round that.',
    type: [String],
    example: ['orders:read', 'orders:write'],
  })
  @IsArray({ message: 'permissions must be an array of permission keys' })
  @IsString({ each: true, message: 'Each permission must be a string key' })
  @MaxLength(100, { each: true, message: 'Permission keys are at most 100 characters' })
  permissions!: string[];
}
