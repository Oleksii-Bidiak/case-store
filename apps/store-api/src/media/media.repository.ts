import { Injectable } from '@nestjs/common';
import { MediaAsset, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

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
}

/** Editable metadata. Only provided keys are written. */
export interface UpdateMediaAssetInput {
  alt?: string | null;
  tags?: string[];
}

/** Filters for the admin library list. */
export interface FindAllMediaParams {
  /** Free-text needle matched against `alt` (case-insensitive substring). */
  search?: string;
  /** Exact tag the asset must carry. */
  tag?: string;
  page: number;
  limit: number;
}

/** `total` counts rows matching the FILTERS, not the rows returned. */
export interface PaginatedMediaResult {
  assets: MediaAsset[];
  total: number;
}

/**
 * All Prisma access for {@link MediaAsset} (TASK-441).
 *
 * Usage — "where is this picture shown" — is deliberately NOT here: it reads
 * six other aggregates and belongs to {@link MediaUsageRepository}, which owns
 * the reasoning about why it is computed rather than stored.
 */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the library, newest first.
   *
   * `search` matches `alt` and `tags` together, because that is what the
   * operator means by "find the autumn banner": they do not know or care which
   * of the two fields they typed the word into. The tag half is an EXACT array
   * membership test (`has`), the alt half a case-insensitive substring — a tag
   * is a token someone chose, alt text is a sentence.
   */
  async findAll(params: FindAllMediaParams): Promise<PaginatedMediaResult> {
    const where = this.buildWhere(params);

    const [assets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return { assets, total };
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

  private buildWhere(params: FindAllMediaParams): Prisma.MediaAssetWhereInput {
    const clauses: Prisma.MediaAssetWhereInput[] = [];

    if (params.search) {
      clauses.push({
        OR: [
          { alt: { contains: params.search, mode: 'insensitive' } },
          { tags: { has: params.search } },
        ],
      });
    }
    if (params.tag) {
      clauses.push({ tags: { has: params.tag } });
    }

    // AND of the two filters, not OR: `?search=банер&tag=осінь` means both, and
    // an implicit OR would widen a narrowing action, which is the direction an
    // operator never expects from a filter.
    return clauses.length > 0 ? { AND: clauses } : {};
  }
}
