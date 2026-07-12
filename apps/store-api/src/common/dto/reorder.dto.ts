import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Shared reorder payloads (TASK-291, plan 158 §3.4 / §4).
 *
 * Hoisted into `common/` so the flat sortable admins (banners / blog-categories /
 * device-brands) can reuse the exact same contract — `ReorderFlatDto` is the degenerate
 * one-bucket, reparent-free case of `ReorderTreeDto`.
 *
 * SEMANTICS: the client sends the COMPLETE, FINAL child list of every parent bucket it
 * touched (1 group for a plain reorder, 2 for a reparent — source + destination). The
 * array index becomes `sortOrder` (0..n-1, contiguous) and every listed id gets that
 * group's `parentId`. Declarative, idempotent, self-healing — and the client can never
 * invent an absolute `sortOrder` (the collision source). The server does NOT trust the
 * payload's bucket set: it computes the affected-parent closure itself, in-transaction.
 */

/** One parent bucket's complete, final child list. */
export class ReorderGroupDto {
  @ApiProperty({
    description: 'Parent bucket id — `null` is the root bucket',
    type: String,
    nullable: true,
    example: null,
  })
  @ValidateIf((o: ReorderGroupDto) => o.parentId !== null)
  @IsUUID('4')
  parentId!: string | null;

  @ApiProperty({
    description:
      'The COMPLETE, FINAL, ordered child list of this bucket. The array index becomes ' +
      '`sortOrder`. MAY be empty — a parent losing its last child is legal.',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  // NO @ArrayNotEmpty() — dragging the ONLY child out of a parent sends that parent an
  // empty list, and it is a day-one operator action (plan §3.4). Non-negotiable.
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}

/** A tree reorder/reparent batch: one group per touched parent bucket. */
export class ReorderTreeDto {
  @ApiProperty({
    description:
      'Touched parent buckets — 1 for a plain reorder, 2 for a reparent (source + ' +
      'destination). The server resolves the full affected-parent closure regardless.',
    type: [ReorderGroupDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReorderGroupDto)
  groups!: ReorderGroupDto[];
}

/** A flat (single-bucket, no reparenting) reorder — banners, blog-categories, brands. */
export class ReorderFlatDto {
  @ApiProperty({
    description: 'The complete, final ordering of the list. The index becomes `sortOrder`.',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
