import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Multipart metadata accompanying an image upload. The binary files themselves
 * are handled by Multer (`files` field); this DTO carries the optional alt texts,
 * one per uploaded file in order.
 */
export class UploadImagesDto {
  @ApiProperty({
    description: 'Optional alt text per uploaded file, in upload order',
    type: [String],
    required: false,
    example: ['iPhone 15 Pro case front', 'iPhone 15 Pro case back'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  altTexts?: string[];
}
