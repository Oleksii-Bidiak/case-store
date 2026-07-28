import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * The LiqPay callback body — **exactly** two fields, and that is load-bearing.
 *
 * The global `ValidationPipe` runs with `whitelist: true` **and**
 * `forbidNonWhitelisted: true` (`main.ts`). Any property LiqPay sends that is not
 * declared here would make the pipe reject the whole request with a 400 before
 * the handler ever runs — and since LiqPay retries a non-200 (undocumented how
 * often), the shop would sit in a permanent callback loop while every payment
 * stayed unpaid. LiqPay posts a form-encoded `data` + `signature` pair and
 * nothing else; everything about the payment lives inside the base64 `data`.
 *
 * Do not "helpfully" add fields here. If LiqPay ever adds a third top-level
 * field, adding it is a deliberate change with a test, not a convenience.
 */
export class LiqPayCallbackDto {
  @ApiProperty({
    description: 'Base64-encoded JSON payload describing the payment',
    example: 'eyJwdWJsaWNfa2V5IjoiaTAwMDAwMDAwIiwic3RhdHVzIjoic3VjY2VzcyJ9',
  })
  @IsString()
  @IsNotEmpty()
  data!: string;

  @ApiProperty({
    description: 'base64( sha3-256( private_key + data + private_key ) )',
    example: '0adgJ8F2Ds5HCVkcz4AlmdLMRoIJf7IxsL3QmeFRz/s=',
  })
  @IsString()
  @IsNotEmpty()
  signature!: string;
}
