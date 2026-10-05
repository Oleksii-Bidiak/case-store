import type { BannerEntity, CreateBannerDto } from "@/shared/api";
import { dict } from "@/shared/config";

/** `CreateBannerDto.title` — `@MaxLength(255)` in the API. */
const BANNER_TITLE_MAX = 255;

/**
 * The create payload of a banner's copy («Дублювати», TASK-1073): every field
 * an operator wrote, a «(копія)» title, and ALWAYS a draft — two identical
 * slides must never go up side by side. Identity, order and the publication
 * window stay behind; the API appends the copy to the end of its placement.
 */
export function duplicateBannerPayload(banner: BannerEntity): CreateBannerDto {
  const optional = (value: string | null | undefined) =>
    value ? value : undefined;
  // The API caps a title at 255; a long one would turn «(копія)» into a 400.
  const room = BANNER_TITLE_MAX - dict.banners.duplicateTitle("").length;
  return {
    placement: banner.placement,
    title: dict.banners.duplicateTitle(banner.title.slice(0, room).trimEnd()),
    subtitle: optional(banner.subtitle),
    imageUrl: optional(banner.imageUrl),
    ctaLabel: optional(banner.ctaLabel),
    ctaHref: optional(banner.ctaHref),
    theme: optional(banner.theme),
    status: "DRAFT",
  };
}
