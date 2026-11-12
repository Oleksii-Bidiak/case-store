import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth';
import { CurrentUser } from '../auth/decorators';
import { MyDevicesService } from './my-devices.service';
import { MyDevicesDto } from './dto';
import { MyDeviceEntity, MyDevicesSettingsEntity, MyDevicesStateEntity } from './entities';

/** `{ data }` envelope — @ApiProperty so Orval types it (TASK-825). */
class MyDevicesResponseEnvelope {
  @ApiProperty({ type: MyDevicesStateEntity })
  data!: MyDevicesStateEntity;
}

/**
 * «Мої пристрої» of the signed-in customer (TASK-1959). Signed-in only: a guest
 * keeps the list in the browser and pushes it in with `POST /merge` once a
 * session exists. The account acted on is ALWAYS the JWT subject.
 */
@ApiTags('My devices')
@ApiExtraModels(
  MyDeviceEntity,
  MyDevicesSettingsEntity,
  MyDevicesStateEntity,
  MyDevicesResponseEnvelope,
)
@ApiBearerAuth('access-token')
@Controller('me/devices')
@UseGuards(JwtAuthGuard)
export class MyDevicesController {
  constructor(private readonly myDevicesService: MyDevicesService) {}

  /** GET /api/me/devices */
  @Get()
  @ApiOperation({
    summary: 'Get my saved devices and catalogue settings',
    operationId: 'getMyDevices',
  })
  @ApiResponse({ status: 200, type: MyDevicesResponseEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyDevices(@CurrentUser('id') userId: string): Promise<{ data: MyDevicesStateEntity }> {
    return { data: await this.myDevicesService.getState(userId) };
  }

  /** PUT /api/me/devices — full replace, last write wins. */
  @Put()
  @ApiOperation({
    summary: 'Replace my saved devices and catalogue settings',
    description:
      'Full replacement of the list and the settings. Unknown or inactive device models are dropped silently; at most 100 devices.',
    operationId: 'replaceMyDevices',
  })
  @ApiResponse({ status: 200, type: MyDevicesResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async replaceMyDevices(
    @CurrentUser('id') userId: string,
    @Body() dto: MyDevicesDto,
  ): Promise<{ data: MyDevicesStateEntity }> {
    return { data: await this.myDevicesService.replaceState(userId, dto) };
  }

  /** POST /api/me/devices/merge — fold the guest (browser) state into the account. */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Merge the guest device list into my account',
    description:
      'Union by model; the later lastUsedAt wins; the guest label wins when set; the account settings win when the account already has them. Returns the merged state.',
    operationId: 'mergeMyDevices',
  })
  @ApiResponse({ status: 200, type: MyDevicesResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async mergeMyDevices(
    @CurrentUser('id') userId: string,
    @Body() dto: MyDevicesDto,
  ): Promise<{ data: MyDevicesStateEntity }> {
    return { data: await this.myDevicesService.mergeGuestState(userId, dto) };
  }
}
