import { Injectable } from '@nestjs/common';
import { MediaAsset, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { MediaUsageRepository } from './media-usage.repository';
import type { MediaListCounts, MediaListSort, MediaListView } from './media-list.types';

/** Everything needed to record one newly uploaded asset. */
export interface CreateMediaAssetInput {
  url: string;
  blurDataUrl: string | null;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  alt: string | null;
  tags: string[];
  uploadedById: string | null;
  /** The client's file name, already normalised; null = unknown (TASK-1731). */
  originalFilename: string | null;
  /** The uploaded file's DETECTED media type; null = unknown (TASK-1731). */
  originalMime: string | null;
}

/** Editable metadata. Only provided keys are written. */
export interface UpdateMediaAssetInput {
  alt?: string | null;
  tags?: string[];
}

/** Filters for the admin library list. */
export interface FindAllMediaParams {
  /**
   * Free-text needle matched against `alt` and `originalFilename`
   * (case-insensitive substring) or an exact tag.
   */
  search?: string;
  /** Exact tag the asset must carry. */
  tag?: string;
  /** Which slice of the filtered library to page through (TASK-1730). */
  view: MediaListView;
  /** Row order; every order ends with `id asc` (TASK-1730). */
  sort: MediaListSort;
  page: number;
  limit: number;
}

/**
 * `total` counts rows matching the filters AND the view — what the pager needs.
 * `counts` are the three views under the filters alone — what the tabs show.
 */
export interface PaginatedMediaResult {
  assets: MediaAsset[];
  total: number;
  counts: MediaListCounts;
}

/**
 * Each sort as a fixed fragment, chosen by key — the request never contributes
 * SQL text. `id ASC` closes every one of them so tied rows (a batch uploaded in
 * the same millisecond, two files of equal size) keep their place across pages.
 */
const ORDER_BY: Record<MediaListSort, Prisma.Sql> = {
  newest: Prisma.sql`m.created_at DESC, m.id ASC`,
  oldest: Prisma.sql`m.created_at ASC, m.id ASC`,
  largest: Prisma.sql`m.bytes DESC, m.id ASC`,
};

interface CountsRow {
  all: number;
  unused: number;
  no_alt: number;
}

/**
 * All Prisma access for {@link MediaAsset} (TASK-441).
 *
 * Usage — "where is this picture shown" — is deliberately NOT here: it reads
 * six other aggregates and belongs to {@link MediaUsageRepository}, which owns
 * the reasoning about why it is computed rather than stored. This repository
 * only borrows its SQL predicate for the «unused» view.
 */
@Injectable()
export class MediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: MediaUsageRepository,
  ) {}

  /**
   * One page of the library, plus the size of each view (TASK-1730).
   *
   * `search` matches `alt` and `tags` together, because that is what the
   * operator means by "find the autumn banner": they do not know or care which
   * of the two fields they typed the word into. The tag half is an EXACT array
   * membership test, the alt half a case-insensitive substring — a tag is a
   * token someone chose, alt text is a sentence.
   *
   * ONE CODE PATH, IN SQL, FOR EVERY VIEW. The «unused» view needs a correlated
   * `NOT EXISTS` over eight tables, which Prisma's query API cannot express; the
   * other two views could stay in Prisma, but then the filters would be written
   * twice and the counters — which need all three views over the same filters —
   * a third time. So the page is chosen by ONE raw query (ids only, in order),
   * the rows are then read back through Prisma by id so the model mapping stays
   * Prisma's, and the counters are one more aggregate over the same WHERE. Every
   * value is a bound parameter; the only SQL text that varies is picked from
   * {@link ORDER_BY} and the view switch below.
   */
  async findAll(params: FindAllMediaParams): Promise<PaginatedMediaResult> {
    const filters = this.filterSql(params);
    const unreferenced = this.usage.unreferencedPredicate(Prisma.sql`m.url`);
    const viewSql: Record<MediaListView, Prisma.Sql> = {
      all: Prisma.sql`TRUE`,
      unused: unreferenced,
      noAlt: Prisma.sql`m.alt IS NULL`,
    };

    const [pageRows, [countsRow]] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT m.id
        FROM media_assets m
        WHERE ${filters} AND ${viewSql[params.view]}
        ORDER BY ${ORDER_BY[params.sort]}
        LIMIT ${params.limit} OFFSET ${(params.page - 1) * params.limit}
      `,
      this.prisma.$queryRaw<CountsRow[]>`
        SELECT count(*)::int AS "all",
               count(*) FILTER (WHERE ${unreferenced})::int AS unused,
               count(*) FILTER (WHERE m.alt IS NULL)::int AS no_alt
        FROM media_assets m
        WHERE ${filters}
      `,
    ]);

    const ids = pageRows.map((row) => row.id);
    const rows =
      ids.length > 0 ? await this.prisma.mediaAsset.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    // Back into the order the SQL chose; `findMany` by id promises none. A row
    // deleted between the two reads is simply absent from this page.
    const assets = ids.flatMap((id) => byId.get(id) ?? []);

    const counts: MediaListCounts = {
      all: countsRow?.all ?? 0,
      unused: countsRow?.unused ?? 0,
      noAlt: countsRow?.no_alt ?? 0,
    };

    return { assets, total: counts[params.view], counts };
  }

  findById(id: string): Promise<MediaAsset | null> {
    return this.prisma.mediaAsset.findUnique({ where: { id } });
  }

  findByUrl(url: string): Promise<MediaAsset | null> {
    return this.prisma.mediaAsset.findUnique({ where: { url } });
  }

  create(input: CreateMediaAssetInput): Promise<MediaAsset> {
    return this.prisma.mediaAsset.create({ data: input });
  }

  update(id: string, input: UpdateMediaAssetInput): Promise<MediaAsset> {
    return this.prisma.mediaAsset.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.mediaAsset.delete({ where: { id } });
  }

  /**
   * The search/tag filters as one SQL condition.
   *
   * The original file name (TASK-1731) is matched exactly like alt — an operator
   * looking for «осінь» may remember the file, not the description.
   *
   * The alt match is `strpos(lower(alt), lower(needle)) > 0` rather than
   * `ILIKE '%' || needle || '%'`: a substring test has no wildcards, so an
   * operator's `%` or `_` is just a character and nothing needs escaping. Same
   * cost — neither form can use an index (see the note on `alt` in
   * schema.prisma). The tag tests use `@>` so the GIN index on `tags` serves them.
   *
   * AND of the two filters, not OR: `?search=банер&tag=осінь` means both, and
   * an implicit OR would widen a narrowing action, which is the direction an
   * operator never expects from a filter.
   */
  private filterSql(params: Pick<FindAllMediaParams, 'search' | 'tag'>): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];

    if (params.search) {
      clauses.push(Prisma.sql`(
        strpos(lower(m.alt), lower(${params.search})) > 0
        OR strpos(lower(m.original_filename), lower(${params.search})) > 0
        OR m.tags @> ARRAY[${params.search}]::text[]
      )`);
    }
    if (params.tag) {
      clauses.push(Prisma.sql`m.tags @> ARRAY[${params.tag}]::text[]`);
    }

    return clauses.length > 0 ? Prisma.join(clauses, ' AND ') : Prisma.sql`TRUE`;
  }
}
