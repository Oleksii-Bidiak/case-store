import { ApiProperty } from '@nestjs/swagger';
import { CatalogImportRun, CatalogImportStatus } from '@prisma/client';

/**
 * One catalogue-import run as the admin screen sees it (TASK-360).
 *
 * `plan` is exposed as a loosely-typed object rather than a nested DTO tree: it
 * is a large, evolving review structure (rows, field changes, referenced
 * entities, parse issues) whose shape belongs to the admin preview, not to the
 * API contract. Pinning it in Swagger would mean maintaining a second copy of
 * `CatalogImportPlan` that adds nothing a consumer could rely on.
 */
export class CatalogImportRunEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'ncaseua.xlsx' })
  filename!: string;

  @ApiProperty({ enum: CatalogImportStatus, example: CatalogImportStatus.PARSED })
  status!: CatalogImportStatus;

  @ApiProperty({ description: 'Rows the plan acts on', example: 1304 })
  totalRows!: number;

  @ApiProperty({ description: 'Products that will be created as hidden drafts', example: 1297 })
  createCount!: number;

  @ApiProperty({ description: 'Products with at least one proposed field change', example: 12 })
  updateCount!: number;

  @ApiProperty({ description: 'Products that will be hidden — gone from the file', example: 3 })
  missingCount!: number;

  @ApiProperty({ description: 'Source rows rejected during parsing', example: 7 })
  errorCount!: number;

  @ApiProperty({ description: 'Rows written so far (progress while APPLYING)', example: 250 })
  appliedRows!: number;

  @ApiProperty({
    description: 'The reviewable plan. Present on the detail read, omitted from the list.',
    required: false,
    type: Object,
    additionalProperties: true,
  })
  plan?: unknown;

  @ApiProperty({ description: 'Why the run failed', required: false, nullable: true })
  error!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'operator@example.com' })
  actorEmail!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ required: false, nullable: true })
  appliedAt!: Date | null;

  /**
   * Build the entity. `includePlan` is false for list reads: the plan is
   * megabytes on a full catalogue, and the list only renders the counters.
   */
  static fromPrisma(run: CatalogImportRun, includePlan = false): CatalogImportRunEntity {
    const entity = new CatalogImportRunEntity();
    entity.id = run.id;
    entity.filename = run.filename;
    entity.status = run.status;
    entity.totalRows = run.totalRows;
    entity.createCount = run.createCount;
    entity.updateCount = run.updateCount;
    entity.missingCount = run.missingCount;
    entity.errorCount = run.errorCount;
    entity.appliedRows = run.appliedRows;
    entity.error = run.error;
    entity.actorEmail = run.actorEmail;
    entity.createdAt = run.createdAt;
    entity.appliedAt = run.appliedAt;
    if (includePlan) {
      entity.plan = run.plan;
    }
    return entity;
  }
}
