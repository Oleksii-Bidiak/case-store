import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CUSTOMER_PASSWORD_DESCRIPTION,
  IsCustomerPassword,
  normalizeEmail,
} from '../../common/validators';

/**
 * Body of `POST /api/auth/account-setup/confirm` (TASK-2010) — the
 * «Задайте пароль» page of an account created at checkout.
 */
export class ConfirmAccountSetupDto {
  @ApiProperty({
    description: 'The single-use setup token from the «Задайте пароль» link',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Setup token is required' })
  token!: string;

  @ApiPropertyOptional({
    description:
      `The account's first password (${CUSTOMER_PASSWORD_DESCRIPTION}). Omitted on ` +
      '«Пропустити»: the address is proven and the session opened all the same; a password ' +
      'can be set later through «Забули пароль?».',
    example: 'strongp@ss123',
    minLength: 8,
  })
  @IsOptional()
  @IsCustomerPassword()
  password?: string;
}

/**
 * Body of `POST /api/auth/checkout/email-status` (TASK-2010). A body, not a
 * query string, so the address never lands in a URL or an access log.
 */
export class CheckoutEmailStatusDto {
  @ApiProperty({ description: 'The e-mail typed at checkout', example: 'olena@example.com' })
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  // Normalised at the boundary — the same spelling `register` looks up.
  @Transform(normalizeEmail)
  email!: string;
}
