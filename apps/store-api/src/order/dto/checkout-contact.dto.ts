import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { GuestContactDto } from './guest-contact.dto';

/**
 * The contact block of a STOREFRONT guest checkout (TASK-2010): the guest
 * contact plus «Створити акаунт на цю пошту».
 *
 * A subclass rather than a field on {@link GuestContactDto}, because that class
 * is also the base of the operator's phone-order contact
 * (`ManualOrderContactDto`), where creating an account has no meaning — an
 * operator must never sign a customer up by ticking a box in the admin panel.
 */
export class CheckoutContactDto extends GuestContactDto {
  @ApiPropertyOptional({
    description:
      '«Створити акаунт на цю пошту» (TASK-2010). True → the order is placed for a password-less ' +
      'account created in the same transaction: the response carries `data.session` (and the ' +
      'refresh cookie), no `guestAccessToken`, and a «Задайте пароль» letter goes to `email`. ' +
      'Required for a guest `discountCode` (else 400 DISCOUNT_ACCOUNT_REQUIRED) and for ' +
      'ONLINE / INSTALLMENTS (else 400 PAYMENT_ACCOUNT_REQUIRED). 409 ACCOUNT_EXISTS when the ' +
      'address already has an account. Limited to 5 per hour per address. Ignored for a ' +
      'signed-in shopper.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;
}
