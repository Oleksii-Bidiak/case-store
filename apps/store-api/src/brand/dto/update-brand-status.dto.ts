import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for toggling a brand's active status (admin-only).
 *
 * `isActive` is the reversible visibility toggle — a deactivated brand is hidden
 * from the storefront filter/strip but keeps all its product links.
 */
export class UpdateBrandStatusDto {
  @ApiProperty({
    description: 'New active status for the brand',
    example: false,
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive!: boolean;
}
