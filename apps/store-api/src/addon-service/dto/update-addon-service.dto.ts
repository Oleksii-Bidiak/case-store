import { IsString, IsOptional, IsBoolean, IsNumber, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating an add-on service (admin-only, TASK-174).
 * All fields optional — only provided fields are written.
 */
export class UpdateAddonServiceDto {
  @ApiProperty({ description: 'Add-on service name', example: 'Страхування', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Name must be at most 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'What the service covers',
    example: 'Покриття випадкових пошкоджень.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string;

  @ApiProperty({
    description: 'Price (may be 0 for a free service)',
    example: 499,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price must not be negative' })
  price?: number;

  @ApiProperty({ description: 'Whether the service is offered', example: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
