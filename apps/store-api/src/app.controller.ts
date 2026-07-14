import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check (verifies the database is reachable)' })
  @ApiResponse({ status: 200, description: 'Service and its database are healthy' })
  @ApiResponse({ status: 503, description: 'The database is unreachable' })
  async health(@Res({ passthrough: true }) response: Response): Promise<unknown> {
    const result = await this.appService.health();

    if (result.status !== 'ok') {
      // Set the status directly rather than throwing: a thrown 5xx would be
      // reported to Sentry by the global exception filter on every probe.
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
