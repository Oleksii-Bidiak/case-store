import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { MEDIA_USAGE_KINDS, MediaUsage } from './media-usage.types';

/** Label shown for the site-settings singleton, which has no name of its own. */
const SITE_SETTINGS_LABEL = 'Site settings';

/**
 * Hard ceiling on how many URLs one {@link MediaUsageRepository.findUsage} call
 * may be asked about.
 *
 * Three of the fourteen sources are `LIKE '%…%'` scans built as an OR per URL,
 * so the predicate count grows with the page size. It is the media list's page
 * limit that feeds this, and capping both at the same number is what keeps a
 * `?limit=100000` from turning one admin request into a hundred-thousand-branch
 * query plan.
 */
export const MEDIA_USAGE_MAX_URLS = 100;

/**
 * Answers "where is this image actually used?" by asking the tables, every time
 * (TASK-441, plan 177).
 *
 * ─── WHY THERE IS NO `usedIn` COLUMN ─────────────────────────────────────────
 *
 * Plan 177 originally put `usedIn[]` on the `MediaAsset` model. It is computed
 * here instead, and that is a deliberate reversal.
 *
 * A stored list is only ever as current as the write paths that remember to
 * update it. Today fourteen columns can hold an image URL; each of them is
 * written by at least one service, several by more than one (a category cover is
 * set by the category form AND by the catalogue importer), and every FUTURE
 * place that records a URL — a new content type, a bulk edit, a data fix run by
 * hand in psql — makes the column quietly wrong without touching a line of media
 * code. Wrong in the dangerous direction, too: a stale-empty `usedIn` is what
 * lets a delete remove a file a live product page is still rendering.
 *
 * This project has already paid for that lesson once. Wave 174's defect class,
 * recorded as "a field of an index without all of its sources of mutation", was
 * exactly this shape. Deriving the answer from the rows themselves cannot go
 * stale, because there is nothing to keep in sync — only this list of columns,
 * and a missing column here is a missing TEST, which `media-usage.repository.spec.ts`
 * turns into a red build per source.
 *
 * ─── WHAT IT COSTS ───────────────────────────────────────────────────────────
 *
 * One query per source table (six), regardless of how many URLs are asked about,
 * plus the singleton read. The three rich-text columns are substring scans that
 * no index can serve; they are bounded by the size of those tables (hundreds of
 * products, dozens of pages and posts), not by the media library, which is the
 * table that actually grows. The list endpoint caps a page at
 * {@link MEDIA_USAGE_MAX_URLS} URLs so the OR-of-LIKEs cannot grow unbounded.
 *
 * The list and the delete gate deliberately share this ONE implementation: the
 * list shows "in use" from the same answer the delete refuses on, so the two can
 * never contradict each other. A cheaper second path for the list is exactly how
 * you end up refusing to delete something the grid showed as free.
 */
@Injectable()
export class MediaUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every current reference to each of `urls`, keyed by URL.
   *
   * URLs with no usage are present in the map with an empty array, so a caller
   * never has to distinguish "not asked" from "not used".
   */
  async findUsage(urls: string[]): Promise<Map<string, MediaUsage[]>> {
    const result = new Map<string, MediaUsage[]>(urls.map((url) => [url, []]));
    if (urls.length === 0) {
      return result;
    }
    if (urls.length > MEDIA_USAGE_MAX_URLS) {
      // Deliberately a throw and not a silent slice: truncating would report
      // "not used" for the URLs that fell off the end, and that answer is the
      // one that deletes a file a live page is still rendering.
      throw new Error(
        `findUsage called with ${urls.length} urls, over the ${MEDIA_USAGE_MAX_URLS} cap`,
      );
    }

    const add = (url: string, usage: MediaUsage): void => {
      result.get(url)?.push(usage);
    };

    // Matching one of the URLs we were asked about, in a column that holds a
    // WHOLE url. `in` rather than a scan: these are exact values.
    const exact = { in: urls };

    // The rich-text columns are matched with `contains`, which compiles to
    // `LIKE '%…%'`: no index serves it, and it can in principle match a little
    // more than intended (an unescaped `_` in a URL is a single-character
    // wildcard). Acceptable, and only in this direction — a wider SQL match can
    // only make us refuse a delete that would have been safe, never allow one
    // that is not. The exact `includes` re-check in JS below then drops the false
    // positives from what we REPORT, so an operator is never sent to an article
    // that does not really contain the image.

    const [products, categories, brands, banners, posts, pages, seo, productImages] =
      await Promise.all([
        this.prisma.product.findMany({
          where: {
            OR: [{ ogImage: exact }, ...urls.map((url) => ({ description: { contains: url } }))],
          },
          select: { id: true, name: true, ogImage: true, description: true },
        }),
        this.prisma.category.findMany({
          where: { OR: [{ image: exact }, { ogImage: exact }] },
          select: { id: true, name: true, image: true, ogImage: true },
        }),
        this.prisma.brand.findMany({
          where: { logo: exact },
          select: { id: true, name: true, logo: true },
        }),
        this.prisma.banner.findMany({
          where: { imageUrl: exact },
          select: { id: true, title: true, imageUrl: true },
        }),
        this.prisma.blogPost.findMany({
          where: {
            OR: [
              { coverImageUrl: exact },
              { ogImage: exact },
              ...urls.map((url) => ({ content: { contains: url } })),
            ],
          },
          select: {
            id: true,
            title: true,
            coverImageUrl: true,
            ogImage: true,
            content: true,
          },
        }),
        this.prisma.page.findMany({
          where: {
            OR: [{ ogImage: exact }, ...urls.map((url) => ({ content: { contains: url } }))],
          },
          select: { id: true, title: true, ogImage: true, content: true },
        }),
        this.prisma.seoSettings.findFirst({
          select: { id: true, defaultOgImage: true, logoUrl: true },
        }),
        this.prisma.productImage.findMany({
          where: { url: exact },
          select: { url: true, product: { select: { id: true, name: true } } },
        }),
      ]);

    for (const image of productImages) {
      add(image.url, {
        kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
        entityId: image.product.id,
        label: image.product.name,
      });
    }

    for (const product of products) {
      for (const url of urls) {
        if (product.ogImage === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.PRODUCT_OG_IMAGE,
            entityId: product.id,
            label: product.name,
          });
        }
        if (product.description?.includes(url)) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.PRODUCT_DESCRIPTION,
            entityId: product.id,
            label: product.name,
          });
        }
      }
    }

    for (const category of categories) {
      for (const url of urls) {
        if (category.image === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.CATEGORY_IMAGE,
            entityId: category.id,
            label: category.name,
          });
        }
        if (category.ogImage === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.CATEGORY_OG_IMAGE,
            entityId: category.id,
            label: category.name,
          });
        }
      }
    }

    for (const brand of brands) {
      if (brand.logo) {
        add(brand.logo, {
          kind: MEDIA_USAGE_KINDS.BRAND_LOGO,
          entityId: brand.id,
          label: brand.name,
        });
      }
    }

    for (const banner of banners) {
      if (banner.imageUrl) {
        add(banner.imageUrl, {
          kind: MEDIA_USAGE_KINDS.BANNER_IMAGE,
          entityId: banner.id,
          label: banner.title,
        });
      }
    }

    for (const post of posts) {
      for (const url of urls) {
        if (post.coverImageUrl === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.BLOG_COVER_IMAGE,
            entityId: post.id,
            label: post.title,
          });
        }
        if (post.ogImage === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.BLOG_OG_IMAGE,
            entityId: post.id,
            label: post.title,
          });
        }
        if (post.content?.includes(url)) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.BLOG_CONTENT,
            entityId: post.id,
            label: post.title,
          });
        }
      }
    }

    for (const page of pages) {
      for (const url of urls) {
        if (page.ogImage === url) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.PAGE_OG_IMAGE,
            entityId: page.id,
            label: page.title,
          });
        }
        if (page.content?.includes(url)) {
          add(url, {
            kind: MEDIA_USAGE_KINDS.PAGE_CONTENT,
            entityId: page.id,
            label: page.title,
          });
        }
      }
    }

    if (seo) {
      if (seo.defaultOgImage) {
        add(seo.defaultOgImage, {
          kind: MEDIA_USAGE_KINDS.SEO_DEFAULT_OG_IMAGE,
          entityId: seo.id,
          label: SITE_SETTINGS_LABEL,
        });
      }
      if (seo.logoUrl) {
        add(seo.logoUrl, {
          kind: MEDIA_USAGE_KINDS.SEO_STORE_LOGO,
          entityId: seo.id,
          label: SITE_SETTINGS_LABEL,
        });
      }
    }

    return result;
  }

  /** Every current reference to one URL. */
  async findUsageForUrl(url: string): Promise<MediaUsage[]> {
    const map = await this.findUsage([url]);
    return map.get(url) ?? [];
  }
}
