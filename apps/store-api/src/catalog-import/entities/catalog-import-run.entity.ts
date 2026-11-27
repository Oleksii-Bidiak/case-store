import { ApiProperty } from '@nestjs/swagger';
import { CatalogImportRun, CatalogImportStatus } from '@prisma/client';
import type { ImportRowFailure } from '../catalog-import.types';

/** One planned row that the run did not write, and why (TASK-2626). */
export class ImportRowFailureEntity implements ImportRowFailure {
  @ApiProperty({ description: "The supplier's article (`Артикул`)", example: 'NC-10452' })
  sourceSku!: string;

  @ApiProperty({ description: '1-based sheet row number', example: 214 })
  rowNumber!: number;

  @ApiProperty({ example: 'Чохол Armor для iPhone 15' })
  name!: string;

  @ApiProperty({
    description: 'Why the write failed — the error message, at most 300 characters',
    example: 'Unique constraint failed on the fields: (`slug`)',
  })
  reason!: string;
}

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
    description:
      'Rows whose write failed — not in appliedRows nor in the counters. ' +
      'null for a run applied before failures were recorded (its counters are the plan).',
    type: [ImportRowFailureEntity],
    nullable: true,
    required: false,
  })
  failures!: ImportRowFailureEntity[] | null;

  @ApiProperty({
    description: 'The reviewable plan. Present on the detail read, omitted from the list.',
    required: false,
    type: Object,
    additionalProperties: true,
  })
  plan?: unknown;

  // `type` is spelled out on every nullable property here (the convention the
  // product DTOs already follow): without it @nestjs/swagger emits a bare
  // `nullable: true` with no type, which Orval turns into an untyped object —
  // and the admin then cannot render the value as text.
  @ApiProperty({
    description: 'Why the run failed',
    required: false,
    nullable: true,
    type: String,
  })
  error!: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    example: 'operator@example.com',
  })
  actorEmail!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ required: false, nullable: true, type: Date })
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
    // On the list read too: the history shows which products a run did not write.
    entity.failures = (run.failures ?? null) as unknown as ImportRowFailureEntity[] | null;
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
