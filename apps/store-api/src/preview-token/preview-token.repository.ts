import { Injectable } from '@nestjs/common';
import { PageKind } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SEO_SETTINGS_SINGLETON_ID as SEO_SETTINGS_ID } from '../seo-settings';

/** What a preview link points at: enough to build its storefront path. */
export interface PreviewTargetRecord {
  id: string;
  slug: string;
}

export interface PreviewPageTargetRecord extends PreviewTargetRecord {
  kind: PageKind;
}

/**
 * Prisma access for the signed preview links (TASK-668): the token generation on the
 * SEO-settings singleton, and the minimal lookups that turn a scope into a storefront
 * path. Every lookup ignores publish status on purpose — previewing a draft is the
 * whole point — but a tombstoned product is gone and is not previewable.
 */
@Injectable()
export class PreviewTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The current generation; 0 when the singleton row does not exist yet. */
  async getVersion(): Promise<number> {
    const row = await this.prisma.seoSettings.findUnique({
      where: { id: SEO_SETTINGS_ID },
      select: { previewTokenVersion: true },
    });
    return row?.previewTokenVersion ?? 0;
  }

  /** Bump the generation (revoke every issued token); returns the new one. */
  async bumpVersion(): Promise<number> {
    const row = await this.prisma.seoSettings.upsert({
      where: { id: SEO_SETTINGS_ID },
      create: { id: SEO_SETTINGS_ID, previewTokenVersion: 1 },
      update: { previewTokenVersion: { increment: 1 } },
      select: { previewTokenVersion: true },
    });
    return row.previewTokenVersion;
  }

  findProduct(id: string): Promise<PreviewTargetRecord | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true },
    });
  }

  findPage(id: string): Promise<PreviewPageTargetRecord | null> {
    return this.prisma.page.findUnique({
      where: { id },
      select: { id: true, slug: true, kind: true },
    });
  }

  findPost(id: string): Promise<PreviewTargetRecord | null> {
    return this.prisma.blogPost.findUnique({ where: { id }, select: { id: true, slug: true } });
  }
}
