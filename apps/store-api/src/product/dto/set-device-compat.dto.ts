import { IsArray, IsUUID, ArrayUnique } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for replacing a product's (or a whole group's) device-compatibility set
 * (TASK-190). An empty array clears all compat. Duplicate ids are rejected;
 * unknown ids are rejected by the service (400) before any write.
 */
export class SetDeviceCompatDto {
  @ApiProperty({
    description: 'Device model ids this product/group is compatible with (replace-all semantics)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsArray()
  @ArrayUnique({ message: 'deviceModelIds must not contain duplicates' })
  @IsUUID(4, { each: true, message: 'Each device model id must be a valid UUID' })
  deviceModelIds!: string[];
}
