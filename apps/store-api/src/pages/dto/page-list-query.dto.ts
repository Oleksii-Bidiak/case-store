import { IsOptional, IsInt, IsEnum, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PageKind, PublishStatus } from '@prisma/client';

/**
 * Query DTO for the public page list (published pages only).
 */
export class PageListQueryDto {
  @ApiProperty({
    description:
      'Filter by page kind. LEGAL backs the /legal hub, INFO the /info help pages. ' +
      'Without it the list still omits HUB rows — a hub row is not a page (TASK-435).',
    enum: PageKind,
    example: PageKind.LEGAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(PageKind, {
    message: `kind must be one of: ${Object.values(PageKind).join(', ')}`,
  })
  kind?: PageKind;

  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;
}

/**
 * Query DTO for a single published page (`GET /api/pages/:slug`).
 *
 * `kind` is how the storefront keeps the two page routes from bleeding into each
 * other (TASK-435): `/legal/<slug>` asks for LEGAL, `/info/<slug>` for INFO, and
 * a mismatch is a 404, so a help page can never be served under a legal address
 * (or the reverse). Without a `kind` the endpoint still refuses HUB rows, which
 * have no address of their own at all.
 */
export class PageDetailQueryDto {
  @ApiProperty({
    description:
      'Require the page to be of this kind; a mismatch is a 404. Omitted, any kind but HUB matches.',
    enum: PageKind,
    example: PageKind.LEGAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(PageKind, {
    message: `kind must be one of: ${Object.values(PageKind).join(', ')}`,
  })
  kind?: PageKind;
}

/**
 * Query DTO for the admin page list (all statuses), with an optional status
 * filter and a title/slug search (TASK-357). The inherited `kind` filter backs
 * the Усі / Юридичні / Довідкові / Хаби tabs — unlike the public list it does
 * NOT hide HUB rows when omitted: the panel is exactly where hub meta tags are
 * edited, so "Усі" must show them.
 *
 * The search lives ONLY on the admin list: the public `GET /api/pages` backs the
 * `/legal` hub, which lists everything published and has nothing to search.
 *
 * It deliberately does NOT extend {@link PageListQueryDto} any more (TASK-428).
 * That superclass carries FIELD INITIALIZERS (`page = 1`, `limit = 20`), so the
 * admin list could never be asked for the complete set — and the reorder UI needs
 * exactly that: a payload that does not name every page in the list is rejected as
 * a lost update. Here `page`/`limit` carry no initializer, so their ABSENCE means
 * "return everything", matching `AdminFaqListQueryDto` and the admin banner list.
 */
export class AdminPageListQueryDto {
  @ApiProperty({
    description: 'Page number (1-based). Omit both page and limit to get the complete list.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @ApiProperty({
    description: 'Items per page. Omit both page and limit to get the complete list.',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number;

  @ApiProperty({
    description: 'Filter by publish status (DRAFT, SCHEDULED, PUBLISHED)',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @IsOptional()
  @IsEnum(PublishStatus, {
    message: `status must be one of: ${Object.values(PublishStatus).join(', ')}`,
  })
  status?: PublishStatus;

  @ApiProperty({
    description: 'Search by page title or slug',
    example: 'достав',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  /**
   * Kind filter for the panel's tabs (TASK-435).
   *
   * DECLARED here rather than inherited, unlike on develop where this class still
   * extended {@link PageListQueryDto}: that inheritance is exactly what TASK-428
   * had to drop (see the class docblock — the superclass's `page = 1` initializer
   * makes the complete list unrequestable). The field came back by hand so the
   * tabs keep working; losing it is what the merge did on its own, and the
   * typechecker is what noticed.
   *
   * Unlike the public readers, an ABSENT kind here means EVERY kind, HUB rows
   * included — the panel is where hub rows are edited.
   */
  @ApiProperty({
    description: 'Filter by page kind (LEGAL, INFO, HUB). Omitted, every kind is listed.',
    enum: PageKind,
    example: PageKind.LEGAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(PageKind, {
    message: `kind must be one of: ${Object.values(PageKind).join(', ')}`,
  })
  kind?: PageKind;
}
