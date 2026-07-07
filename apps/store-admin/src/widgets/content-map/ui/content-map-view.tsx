"use client";

import {
  useAdminBannerControllerFindAll,
  type BannerEntity,
} from "@/entities/banner";
import {
  useAdminFaqControllerFindAll,
  type FaqItemEntity,
} from "@/entities/faq";
import { useAdminPageControllerFindAll } from "@/entities/page";
import { useAdminBlogControllerFindAll } from "@/entities/blog";
import { dict } from "@/shared/config";
import {
  CONTENT_MAP_ZONES,
  CONTENT_MAP_PAGE_GROUPS,
  type ContentMapZoneCount,
  type ContentMapZoneId,
} from "../model/content-map-zones";
import { ContentMapPageGroup } from "./content-map-page-group";
import { type ZoneCountState } from "./content-map-zone-card";

/** The four independent count sources feeding the nine zones. */
interface CountSources {
  banners: {
    data: BannerEntity[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  faq: {
    data: FaqItemEntity[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  pages: { total: number | undefined; isLoading: boolean; isError: boolean };
  blog: { total: number | undefined; isLoading: boolean; isError: boolean };
}

/**
 * Map a zone's declared count source to a render-ready state. The exhaustive
 * `switch` over the discriminated `ContentMapZoneCount` union means a future
 * count `kind` that isn't handled here fails the build rather than silently
 * rendering nothing.
 */
function resolveZoneCountState(
  count: ContentMapZoneCount,
  sources: CountSources,
): ZoneCountState {
  if (count === null) {
    return { status: "none" };
  }

  switch (count.kind) {
    case "banner": {
      const { data, isLoading, isError } = sources.banners;
      if (isLoading) return { status: "loading" };
      if (isError || !data) return { status: "error" };
      return {
        status: "ready",
        value: data.filter((b) => b.placement === count.placement).length,
      };
    }
    case "faq": {
      const { data, isLoading, isError } = sources.faq;
      if (isLoading) return { status: "loading" };
      if (isError || !data) return { status: "error" };
      return {
        status: "ready",
        value: data.filter((f) => f.isActive).length,
      };
    }
    case "pages": {
      const { total, isLoading, isError } = sources.pages;
      if (isLoading) return { status: "loading" };
      if (isError || total === undefined) return { status: "error" };
      return { status: "ready", value: total };
    }
    case "blog": {
      const { total, isLoading, isError } = sources.blog;
      if (isLoading) return { status: "loading" };
      if (isError || total === undefined) return { status: "error" };
      return { status: "ready", value: total };
    }
  }
}

/**
 * «Карта контенту» — the content-map widget (TASK-264-B). Issues exactly four
 * list queries (banners collapse to one shared fetch, counted per placement
 * client-side; faq/pages/blog one each), resolves every zone's active count
 * from them, and renders the five storefront page frames plus a static
 * catalog/PDP note. Each query is handled independently, so a single failed
 * count degrades only that zone's marker — the navigation links always render.
 */
export function ContentMapView() {
  // Banners: one fetch for all four placement counts (mirrors AdminBannerTable's
  // in-memory grouping); "active" here means PUBLISHED.
  const bannersQuery = useAdminBannerControllerFindAll({ status: "PUBLISHED" });
  // FAQ: the admin list returns every item (any status); active = isActive.
  const faqQuery = useAdminFaqControllerFindAll();
  // Pages/blog: only meta.total is read, so limit:1 keeps the body tiny. This is
  // a distinct query key from the admin tables' calls — it does not share cache.
  const pagesQuery = useAdminPageControllerFindAll({
    status: "PUBLISHED",
    limit: 1,
  });
  const blogQuery = useAdminBlogControllerFindAll({
    status: "PUBLISHED",
    limit: 1,
  });

  const sources: CountSources = {
    banners: {
      data: bannersQuery.data?.data,
      isLoading: bannersQuery.isLoading,
      isError: bannersQuery.isError,
    },
    faq: {
      data: faqQuery.data?.data,
      isLoading: faqQuery.isLoading,
      isError: faqQuery.isError,
    },
    pages: {
      total: pagesQuery.data?.meta?.total,
      isLoading: pagesQuery.isLoading,
      isError: pagesQuery.isError,
    },
    blog: {
      total: blogQuery.data?.meta?.total,
      isLoading: blogQuery.isLoading,
      isError: blogQuery.isError,
    },
  };

  const countStates = Object.fromEntries(
    CONTENT_MAP_ZONES.map((zone) => [
      zone.id,
      resolveZoneCountState(zone.count, sources),
    ]),
  ) as Record<ContentMapZoneId, ZoneCountState>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {CONTENT_MAP_PAGE_GROUPS.map((group) => (
          <ContentMapPageGroup
            key={group.id}
            group={group}
            countStates={countStates}
          />
        ))}
      </div>

      <p className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        {dict.contentMap.catalogNote}
      </p>
    </div>
  );
}
