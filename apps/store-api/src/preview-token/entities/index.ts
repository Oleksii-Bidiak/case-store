import { ApiProperty } from '@nestjs/swagger';

/** A freshly issued preview link (TASK-668). */
export class PreviewTokenEntity {
  @ApiProperty({
    description:
      'The signed token. The storefront opens `/preview?token=<token>`; the token is good ' +
      'for one thing (its scope) until `expiresAt`, or until every preview is revoked.',
  })
  token!: string;

  @ApiProperty({
    description: 'Storefront path of the previewed thing (`/`, `/products/<slug>`, …)',
    example: '/products/spigen-liquid-air-15',
  })
  path!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'When the link stops working' })
  expiresAt!: Date;
}

/** What a valid token opens right now (TASK-668). */
export class ResolvedPreviewTokenEntity {
  @ApiProperty({
    description: 'The scope: `home`, `product:<id>`, `page:<id>` or `post:<id>`',
    example: 'home',
  })
  scope!: string;

  @ApiProperty({
    description: 'Storefront path to land on, from the CURRENT slug',
    example: '/',
  })
  path!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}
