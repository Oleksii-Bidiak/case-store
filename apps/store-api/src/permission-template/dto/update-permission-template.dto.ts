import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `PATCH /api/admin/permission-templates/:id` (TASK-477, plan 181).
 *
 * PATCH, because a template has three independent things to change and renaming
 * one should not require resending its thirty keys. But `permissions`, WHEN SENT,
 * is still the complete set rather than a delta — an absent key in a submitted
 * array is a removal, the same rule the person-level write follows. Half the
 * repo's bugs in this area came from two mental models of "update"; there is one
 * here.
 *
 * EDITING A TEMPLATE CHANGES NOBODY'S ACCESS. That is the copy rule (plan 178,
 * decision 2), and it is what makes this an ordinary edit rather than a
 * permission change — see `permission-template.service.ts`.
 */
export class UpdatePermissionTemplateDto {
  @ApiProperty({ description: 'New name', example: 'Оператор замовлень', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name?: string;

  @ApiProperty({ description: 'New description', required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be at most 500 characters' })
  description?: string;

  @ApiProperty({
    description: 'The COMPLETE new set of permission keys. Omit to leave the set untouched.',
    type: [String],
    required: false,
    example: ['orders:read', 'orders:write', 'payments:read'],
  })
  @IsOptional()
  @IsArray({ message: 'permissions must be an array of permission keys' })
  @IsString({ each: true, message: 'Each permission must be a string key' })
  @MaxLength(100, { each: true, message: 'Permission keys are at most 100 characters' })
  permissions?: string[];
}
