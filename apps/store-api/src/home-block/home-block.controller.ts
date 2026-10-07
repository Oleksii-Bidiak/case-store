import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HomeBlockService } from './home-block.service';
import { PublicHomeBlockEntity } from './entities';

/** Response envelope for the public homepage read. */
class PublicHomeBlockListResponse {
  @ApiProperty({ type: [PublicHomeBlockEntity] })
  data!: PublicHomeBlockEntity[];
}

/**
 * The storefront homepage as data (TASK-661):
 *
 *   GET /api/home-blocks — the visible blocks in page order, carousels resolved
 */
@ApiTags('Home blocks')
@ApiExtraModels(PublicHomeBlockEntity, PublicHomeBlockListResponse)
@Controller('home-blocks')
export class HomeBlockController {
  constructor(private readonly homeBlockService: HomeBlockService) {}

  @Get()
  @ApiOperation({
    summary: 'The homepage: visible blocks in page order, with carousels and tabs resolved',
  })
  @ApiResponse({
    status: 200,
    description:
      'PUBLISHED blocks in page order. A CAROUSEL block whose carousel is not published is ' +
      'left out; a TABS block keeps only its published tabs and is returned even with none.',
    type: PublicHomeBlockListResponse,
  })
  async findAll(): Promise<PublicHomeBlockListResponse> {
    return { data: await this.homeBlockService.findPublic() };
  }
}
