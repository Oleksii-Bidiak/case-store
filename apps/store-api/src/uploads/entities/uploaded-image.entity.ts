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
    // `type: String` is MANDATORY here, not decoration. The declared type is a UNION, and a
    // union has no single `design:type` — TypeScript emits `Object`, so without this key the
    // published schema is `{"type":"object","nullable":true}` and Orval generates
    // `{ [key: string]: unknown } | null`: an opaque map where the server has always sent a
    // base64 data-URL string. Every caller then needs an unchecked cast to hand it to
    // `next/image`, and every non-TypeScript client inherits the same wrong contract.
    // `ProductImageEntity.blurDataUrl` is the precedent. `required` is deliberately NOT
    // relaxed: unlike that entity's, this property is on every upload response, so making it
    // optional would be a second, opposite lie about the payload.
    // Guarded by uploaded-image.entity.spec.ts, which builds the real OpenAPI document.
    type: String,
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
