import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto';

/**
 * Confirmation payload for a successful contact submission. Only the new
 * message id is returned — no stored PII is echoed back to the sender.
 */
class ContactMessageCreatedData {
  @ApiProperty({
    description: 'Identifier of the created contact message',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;
}

/**
 * Response envelope for a successful contact submission.
 */
class ContactMessageCreatedResponse {
  @ApiProperty({ type: ContactMessageCreatedData })
  data!: ContactMessageCreatedData;
}

/**
 * Public (storefront) contact endpoint.
 *
 *   POST /api/contact — submit a contact / support message
 *
 * Rate-limited well below the global window: the form is unauthenticated and a
 * natural spam target.
 */
@ApiTags('Contact')
@ApiExtraModels(ContactMessageCreatedData, ContactMessageCreatedResponse)
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * POST /api/contact
   *
   * Accept a contact-form submission. Returns `{ data: { id } }` on success.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Unauthenticated public write and a spam target — cap strictly (5/min per IP),
  // matching the auth register/login limits.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a contact message', operationId: 'contactControllerSubmit' })
  @ApiResponse({
    status: 201,
    description: 'Contact message received',
    type: ContactMessageCreatedResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
  async submit(@Body() dto: CreateContactMessageDto): Promise<ContactMessageCreatedResponse> {
    const message = await this.contactService.create(dto);
    return { data: { id: message.id } };
  }
}
