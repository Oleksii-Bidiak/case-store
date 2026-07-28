import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard, RolesGuard, CurrentUser } from '../../auth';
import { ReturnService } from './return.service';
import { ReturnEntity, ReturnItemEntity } from './entities';
import { CreateReturnDto } from './dto';

class ReturnResponseEnvelope {
  @ApiProperty({ type: ReturnEntity })
  data!: ReturnEntity;
}

class ReturnListResponseEnvelope {
  @ApiProperty({ type: [ReturnEntity] })
  data!: ReturnEntity[];
}

/**
 * Customer-facing return (RMA) endpoints (TASK-340).
 *
 * Scoped to the caller's own orders throughout — a return names order lines, and
 * order lines are the one place a mistake leaks another customer's purchase
 * history.
 */
@ApiTags('Returns')
@ApiBearerAuth('access-token')
@ApiExtraModels(ReturnEntity, ReturnItemEntity, ReturnResponseEnvelope, ReturnListResponseEnvelope)
@Controller('orders/:orderId/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  /**
   * POST /api/orders/:orderId/returns
   *
   * Open a return against one of the caller's own orders.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Opening a return is cheap for the customer and expensive for the shop
  // (someone has to read every one), so cap it well below the global rate.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a return', operationId: 'createReturn' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 201, description: 'Return requested', type: ReturnResponseEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Order has not shipped, unknown line, or more units than were bought',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async createReturn(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ): Promise<ReturnResponseEnvelope> {
    const data = await this.returnService.createReturn(userId, orderId, dto);
    return { data };
  }

  /**
   * GET /api/orders/:orderId/returns
   *
   * The returns the caller has opened against this order.
   */
  @Get()
  @ApiOperation({ summary: 'List returns for an order', operationId: 'getOrderReturns' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns for the order',
    type: ReturnListResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderReturns(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<ReturnListResponseEnvelope> {
    const data = await this.returnService.getOrderReturns(userId, orderId);
    return { data };
  }
}
