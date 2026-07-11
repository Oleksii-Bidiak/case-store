import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for toggling an add-on service's active status (admin-only, TASK-174).
 *
 * Deactivating withdraws the service from every resolved set immediately —
 * template membership and product deltas alike — without touching carts or
 * orders that already reference it (a cart re-validates on its next read; an
 * order is a frozen snapshot).
 */
export class UpdateAddonServiceStatusDto {
  @ApiProperty({ description: 'New active status for the add-on service', example: false })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive!: boolean;
}
