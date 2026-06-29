import { ApiProperty } from '@nestjs/swagger';
import { SiteContactSettings } from '@prisma/client';

/**
 * Domain entity representing the singleton site-contact settings.
 *
 * This is a clean domain entity — not a Prisma model. It is returned by
 * SiteContactService and surfaced in the storefront footer / contacts page.
 * All fields are nullable: the row may be unseeded, or an admin may clear any
 * individual field.
 */
export class SiteContactSettingsEntity {
  @ApiProperty({
    description: 'Singleton row identifier (always the well-known constant)',
    example: '00000000-0000-0000-0000-000000000001',
  })
  id!: string;

  @ApiProperty({
    description: 'Support email address',
    example: 'support@mobilestore.ua',
    type: String,
    nullable: true,
    required: false,
  })
  email!: string | null;

  @ApiProperty({
    description: 'Support phone number',
    example: '+380 44 000 0000',
    type: String,
    nullable: true,
    required: false,
  })
  phone!: string | null;

  @ApiProperty({
    description: 'Working hours, free-form text',
    example: 'Пн–Нд: 9:00 – 20:00',
    type: String,
    nullable: true,
    required: false,
  })
  workingHours!: string | null;

  @ApiProperty({
    description: 'Viber contact link',
    example: 'https://viber.me/example',
    type: String,
    nullable: true,
    required: false,
  })
  viberLink!: string | null;

  @ApiProperty({
    description: 'Telegram contact link',
    example: 'https://t.me/example',
    type: String,
    nullable: true,
    required: false,
  })
  telegramLink!: string | null;

  @ApiProperty({
    description: 'Instagram profile link',
    example: 'https://instagram.com/example',
    type: String,
    nullable: true,
    required: false,
  })
  instagramLink!: string | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Build an entity from the Prisma row.
   */
  static fromPrisma(row: SiteContactSettings): SiteContactSettingsEntity {
    const entity = new SiteContactSettingsEntity();
    entity.id = row.id;
    entity.email = row.email;
    entity.phone = row.phone;
    entity.workingHours = row.workingHours;
    entity.viberLink = row.viberLink;
    entity.telegramLink = row.telegramLink;
    entity.instagramLink = row.instagramLink;
    entity.createdAt = row.createdAt;
    entity.updatedAt = row.updatedAt;
    return entity;
  }

  /**
   * Build an empty entity (all contact fields null) for the case where the
   * singleton row has not been seeded yet. The public GET endpoint never 404s.
   */
  static empty(): SiteContactSettingsEntity {
    const entity = new SiteContactSettingsEntity();
    const now = new Date(0);
    entity.id = '00000000-0000-0000-0000-000000000001';
    entity.email = null;
    entity.phone = null;
    entity.workingHours = null;
    entity.viberLink = null;
    entity.telegramLink = null;
    entity.instagramLink = null;
    entity.createdAt = now;
    entity.updatedAt = now;
    return entity;
  }
}
