import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CustomerTelegramLink,
  CustomerTelegramStatus,
} from '../telegram/customer-telegram.service';

/**
 * A customer's Telegram notifications (TASK-679): can they be connected, and
 * are they. Served to an account (profile) and to a guest (order-success page).
 */
export class CustomerTelegramStatusDto {
  @ApiProperty({
    description:
      'The bot can be connected right now. `false` when the shop has not configured the bot or ' +
      'it is not answering — show that the option is unavailable; `POST …/link` answers 409.',
    example: true,
  })
  available!: boolean;

  @ApiProperty({
    description: 'At least one Telegram chat receives these notifications',
    example: true,
  })
  connected!: boolean;

  @ApiPropertyOptional({
    description:
      'The most recently connected chat: @username or first name, as it was when connected',
    example: '@olena',
  })
  label?: string;

  @ApiPropertyOptional({
    description: 'When that chat was connected; present when `connected`',
    format: 'date-time',
    example: '2026-10-07T12:00:00.000Z',
  })
  createdAt?: string;

  @ApiPropertyOptional({
    description: 'Bot username without the @, present when `available`',
    example: 'casestore_bot',
  })
  botUsername?: string;

  static from(status: CustomerTelegramStatus): CustomerTelegramStatusDto {
    return {
      available: status.available,
      connected: status.connected,
      ...(status.label ? { label: status.label } : {}),
      ...(status.createdAt ? { createdAt: status.createdAt.toISOString() } : {}),
      ...(status.botUsername ? { botUsername: status.botUsername } : {}),
    };
  }
}

export class CustomerTelegramStatusResponse {
  @ApiProperty({ type: CustomerTelegramStatusDto })
  data!: CustomerTelegramStatusDto;
}

/** A fresh one-time link for a customer's private chat (TASK-679). */
export class CustomerTelegramLinkDto {
  @ApiProperty({
    description:
      'Open on the phone (or scan as a QR code) and press «Старт»: that private chat is ' +
      'connected. One-time; expires at `expiresAt` (15 minutes from issue).',
    example: 'https://t.me/casestore_bot?start=Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg',
  })
  deepLink!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-07T12:15:00.000Z' })
  expiresAt!: string;

  static from(link: CustomerTelegramLink): CustomerTelegramLinkDto {
    return { deepLink: link.deepLink, expiresAt: link.expiresAt.toISOString() };
  }
}

export class CustomerTelegramLinkResponse {
  @ApiProperty({ type: CustomerTelegramLinkDto })
  data!: CustomerTelegramLinkDto;
}
