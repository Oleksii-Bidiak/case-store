import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FailClosedThrottle } from '../throttler';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto, UnsubscribeDto } from './dto';

/**
 * Response envelope for the public subscribe endpoint. Deliberately minimal — it
 * confirms the opt-in without echoing back any stored subscriber data.
 */
class SubscribeResult {
  @ApiProperty({ description: 'Always true on a successful (idempotent) subscribe', example: true })
  subscribed!: boolean;
}

class SubscribeResponse {
  @ApiProperty({ type: SubscribeResult })
  data!: SubscribeResult;
}

class UnsubscribeResult {
  @ApiProperty({
    description: 'Always true on a successful (idempotent) unsubscribe',
    example: true,
  })
  unsubscribed!: boolean;
}

class UnsubscribeResponse {
  @ApiProperty({ type: UnsubscribeResult })
  data!: UnsubscribeResult;
}

/**
 * Public (storefront) newsletter endpoints.
 *
 *   POST /api/newsletter/subscribe    — idempotent opt-in (rate limited)
 *   POST /api/newsletter/unsubscribe  — idempotent opt-out (rate limited)
 */
@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @HttpCode(200)
  // Rate limit the public opt-in to curb abuse / list-stuffing: 5 per minute per IP.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // …and refuse the opt-in outright when the limiter itself is down: uncapped,
  // this endpoint mass-subscribes strangers' addresses, and the bounces and spam
  // complaints that follow burn our sending domain's reputation (TASK-464).
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Subscribe an email to the newsletter (idempotent)' })
  @ApiResponse({
    status: 200,
    description: 'Subscribed (or re-activated)',
    type: SubscribeResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async subscribe(@Body() dto: SubscribeDto): Promise<SubscribeResponse> {
    const data = await this.newsletterService.subscribe(dto);

    return { data };
  }

  @Post('unsubscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // Same cap and same fail-closed rule as subscribe: uncapped opt-out lets a
  // stranger walk a list of addresses off our newsletter (TASK-464).
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Unsubscribe an email from the newsletter (idempotent)' })
  @ApiResponse({ status: 200, description: 'Unsubscribed', type: UnsubscribeResponse })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async unsubscribe(@Body() dto: UnsubscribeDto): Promise<UnsubscribeResponse> {
    const data = await this.newsletterService.unsubscribe(dto.email);

    return { data };
  }
}
