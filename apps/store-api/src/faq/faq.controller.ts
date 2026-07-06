import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { FaqService } from './faq.service';
import { FaqItemEntity } from './entities';

/**
 * Response envelope for the public FAQ list.
 */
export class FaqListResponse {
  @ApiProperty({ type: [FaqItemEntity], description: 'Active FAQ items ordered by sortOrder' })
  data!: FaqItemEntity[];
}

/**
 * Public FAQ browsing (no auth required).
 *
 *   GET /api/faq — active FAQ items for the storefront /info hub + PDP FAQPage
 */
@ApiTags('FAQ')
@ApiExtraModels(FaqItemEntity, FaqListResponse)
@Controller('faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  /**
   * GET /api/faq
   *
   * Returns all active FAQ items ordered by sortOrder for the storefront FAQ
   * section and the FAQPage JSON-LD. Public — no authentication.
   */
  @Get()
  @ApiOperation({ summary: 'List active FAQ items' })
  @ApiResponse({
    status: 200,
    description: 'List of active FAQ items',
    type: FaqListResponse,
  })
  async findAll(): Promise<FaqListResponse> {
    return this.faqService.findAllActive();
  }
}
