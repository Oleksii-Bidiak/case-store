import { ApiProperty } from '@nestjs/swagger';

/**
 * The staff member behind a change to a product, as the admin product list shows it
 * («видалено … · Олена К.», TASK-1830). Resolved from the action log, not from a column
 * on the product — see `ProductService.adminFindAll`.
 */
export class ProductActorEntity {
  @ApiProperty({
    description: 'User id of the actor (the action-log `actorId`)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description:
      'Display name: «first last» from the user record. Null when the account has no ' +
      'name or no longer exists — the email the action log recorded is never sent in ' +
      'its place (one employee does not see another one’s address); the admin shows a ' +
      'neutral label',
    type: String,
    nullable: true,
    example: 'Олена Коваль',
  })
  name!: string | null;
}
