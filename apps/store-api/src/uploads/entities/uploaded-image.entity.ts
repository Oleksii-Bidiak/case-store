import { ApiProperty } from '@nestjs/swagger';

/** One stored image, as returned to the admin panel after an upload. */
export class UploadedImageEntity {
  @ApiProperty({
    description: 'Absolute public URL of the stored image',
    example: 'http://localhost:3001/uploads/content/8f1c….webp',
  })
  url!: string;

  @ApiProperty({
    description:
      'base64 LQIP for `next/image` blur-up, or null when the file was stored as-is (animated GIF)',
    nullable: true,
    example: 'data:image/webp;base64,UklGR…',
  })
  blurDataUrl!: string | null;
}

/** Response envelope for a single upload. */
export class UploadedImageResponseEnvelope {
  @ApiProperty({ type: UploadedImageEntity })
  data!: UploadedImageEntity;
}
