import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CatalogImportService, MAX_IMPORT_BYTES } from './catalog-import.service';
import { ApplyImportDto } from './dto';
import { CatalogImportRunEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { CurrentUser } from '../auth';

/** The two MIME types Excel and LibreOffice send for an .xlsx upload. */
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

/**
 * Multer options for the workbook upload. Buffered in memory: the file is parsed
 * immediately and then handed to the storage service, so there is nothing a
 * temp file would buy.
 */
const importMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ): void => {
    // Trust the extension over the MIME type: browsers report .xlsx
    // inconsistently, and `application/octet-stream` is a common stand-in.
    if (file.originalname.toLowerCase().endsWith('.xlsx') && ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Очікується файл .xlsx'), false);
    }
  },
};

/** Response envelope for a single run. */
class CatalogImportRunEnvelope {
  @ApiProperty({ type: CatalogImportRunEntity })
  data!: CatalogImportRunEntity;

  @ApiProperty({
    description:
      'Id of an earlier APPLIED run parsed from byte-identical content, when there is one.',
    required: false,
    nullable: true,
    type: String,
  })
  duplicateOf?: string | null;
}

/** Response envelope for the run history. */
class CatalogImportRunListEnvelope {
  @ApiProperty({ type: [CatalogImportRunEntity] })
  data!: CatalogImportRunEntity[];
}

/**
 * Supplier-catalogue import (TASK-360).
 *
 * The flow is deliberately two-step: `POST /catalog-import` only PARSES and
 * diffs — it writes nothing to the catalogue — and `POST /:id/apply` is the
 * separate, explicit confirmation. One upload can rewrite the entire catalogue,
 * so the operator gets to see exactly what will change before anything does.
 */
@ApiTags('Catalog import')
@Controller('catalog-import')
@UseGuards(PermissionGuard)
@RequirePermission('catalog:import')
@ApiBearerAuth('access-token')
export class CatalogImportController {
  constructor(private readonly service: CatalogImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', importMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a supplier catalogue and compute its import plan (dry run)',
    description:
      'Parses the workbook and diffs it against the import ledger. Writes NOTHING ' +
      'to the catalogue — the returned run has to be confirmed via /apply.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, type: CatalogImportRunEnvelope })
  @ApiResponse({ status: 400, description: 'Not an .xlsx file, or it could not be parsed' })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('email') email: string | undefined,
  ): Promise<CatalogImportRunEnvelope> {
    if (!file) {
      throw new BadRequestException('Файл не надіслано.');
    }
    const { run, plan, duplicateOf } = await this.service.createRun(
      file.buffer,
      file.originalname,
      { id: userId ?? null, email: email ?? null },
    );
    const data = CatalogImportRunEntity.fromPrisma(run);
    data.plan = plan;
    return { data, duplicateOf };
  }

  @Get()
  @ApiOperation({ summary: 'List recent import runs (without their plans)' })
  @ApiResponse({ status: 200, type: CatalogImportRunListEnvelope })
  async list(@Query('limit') limit?: string): Promise<CatalogImportRunListEnvelope> {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    const runs = await this.service.listRuns(take);
    return { data: runs.map((run) => CatalogImportRunEntity.fromPrisma(run)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one run with its full plan and progress' })
  @ApiResponse({ status: 200, type: CatalogImportRunEnvelope })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CatalogImportRunEnvelope> {
    const run = await this.service.getRun(id);
    return { data: CatalogImportRunEntity.fromPrisma(run, true) };
  }

  @Post(':id/apply')
  @ApiOperation({
    summary: 'Confirm a plan and queue it for writing',
    description:
      'Marks the run APPLYING and returns immediately; a background worker writes ' +
      'it in chunks. Poll GET /:id for progress.',
  })
  @ApiResponse({ status: 201, type: CatalogImportRunEnvelope })
  @ApiResponse({ status: 409, description: 'The run has already been applied or cancelled' })
  async apply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ApplyImportDto,
  ): Promise<CatalogImportRunEnvelope> {
    const run = await this.service.apply(id, dto);
    return { data: CatalogImportRunEntity.fromPrisma(run) };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Discard a plan without applying it' })
  @ApiResponse({ status: 201, type: CatalogImportRunEnvelope })
  @ApiResponse({ status: 409, description: 'The run has already been applied' })
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CatalogImportRunEnvelope> {
    const run = await this.service.cancel(id);
    return { data: CatalogImportRunEntity.fromPrisma(run) };
  }
}
