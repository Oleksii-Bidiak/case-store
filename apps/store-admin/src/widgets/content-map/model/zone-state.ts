import type { BannerEntity } from "@/entities/banner";
import type { CarouselEntity } from "@/entities/carousel";
import type { DiscountEntity } from "@/entities/discount";
import type {
  SeoHealthEntity,
  SeoSettingsEntity,
} from "@/entities/seo-settings";
import type { SiteContactSettingsEntity } from "@/entities/site-contact";
import { formatDate } from "@/shared/lib";
import { dict } from "@/shared/config";

const c = dict.contentMap;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a zone card says about its zone right now (ContentMapProposal ДЩ1–ДЩ3).
 *
 * `unavailable` — this session may not read the zone's source (a content
 * manager without `discounts:write`, say): the card still shows the zone and
 * its links, just no state — a missing number beats a red «не вдалося»
 * caused by a 403 (the AD-CNT-26 lesson).
 */
export type ZoneState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      summary: string;
      badge?: { text: string; tone: "warning" | "muted" };
    };

/** «15.10» — day and month in Kyiv time. */
function dayMonth(iso: string): string {
  return formatDate(iso).slice(0, 5);
}

const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).getTime() : Number.NaN;

/**
 * A banner placement: how many are live, how many scheduled, and the one date
 * worth a warning — when the soonest live one comes down («до 15.10 · ще 14
 * днів»), else when the next scheduled one goes up.
 */
export function bannerZoneState(
  banners: readonly BannerEntity[],
  placement: BannerEntity["placement"],
  now: number,
): ZoneState {
  const own = banners.filter((banner) => banner.placement === placement);
  const live = own.filter((banner) => banner.status === "PUBLISHED");
  const scheduled = own.filter((banner) => banner.status === "SCHEDULED");

  const summary =
    c.shown(live.length) +
    (scheduled.length > 0 ? ` · ${c.scheduled(scheduled.length)}` : "");

  const ending = live
    .map((banner) => banner.scheduledUntil)
    .filter((until): until is string => time(until) > now)
    .sort((a, b) => time(a) - time(b))[0];
  if (ending) {
    const days = Math.max(1, Math.ceil((time(ending) - now) / DAY_MS));
    return {
      status: "ready",
      summary,
      badge: { text: c.endsBadge(dayMonth(ending), days), tone: "warning" },
    };
  }
  const starting = scheduled
    .map((banner) => banner.scheduledAt)
    .filter((at): at is string => Number.isFinite(time(at)))
    .sort((a, b) => time(a) - time(b))[0];
  return starting
    ? {
        status: "ready",
        summary,
        badge: { text: c.startsBadge(dayMonth(starting)), tone: "muted" },
      }
    : { status: "ready", summary };
}

/** A carousel placement: the live carousels, by title, in display order. */
export function carouselZoneState(
  carousels: readonly CarouselEntity[],
  placement: CarouselEntity["placement"],
): ZoneState {
  const live = carousels
    .filter(
      (carousel) =>
        carousel.placement === placement && carousel.status === "PUBLISHED",
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (live.length === 0) return { status: "ready", summary: c.shown(0) };
  return placement === "HOME_TABS"
    ? {
        status: "ready",
        summary: c.carouselTabsState(
          live.length,
          live.map((carousel) => carousel.title).join(", "),
        ),
      }
    : {
        status: "ready",
        summary: c.carouselRailsState(
          live.length,
          live.map((carousel) => `«${carousel.title}»`).join(", "),
        ),
      };
}

/** Contacts: which of the form's fields are filled — nothing promised beyond it. */
export function contactsZoneState(
  settings: SiteContactSettingsEntity,
): ZoneState {
  const filled = (value: string | null | undefined) => Boolean(value?.trim());
  const messengers = [settings.viberLink, settings.telegramLink].filter(
    filled,
  ).length;
  const parts = [
    filled(settings.phone) ? c.contactParts.phone : null,
    filled(settings.email) ? c.contactParts.email : null,
    filled(settings.workingHours) ? c.contactParts.hours : null,
    messengers > 0 ? c.contactParts.messengers(messengers) : null,
    filled(settings.instagramLink) ? c.contactParts.instagram : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0
    ? { status: "ready", summary: parts.join(", ") }
    : {
        status: "ready",
        summary: c.contactsEmpty,
        badge: { text: c.contactsFill, tone: "warning" },
      };
}

/**
 * SEO: the warnings the «Стан SEO» section of /settings/seo paints amber —
 * the site hidden from search, defaults not filled, pages without a
 * description, pages with thin content.
 */
export function seoZoneState(
  settings: SeoSettingsEntity,
  health: SeoHealthEntity,
): ZoneState {
  const defaultsFilled = Boolean(
    settings.defaultMetaTitle?.trim() &&
    settings.defaultMetaDescription?.trim(),
  );
  const warnings = [
    settings.noindexSite,
    !defaultsFilled,
    health.pagesMissingMetaDescription > 0,
    health.pagesThinContent > 0,
  ].filter(Boolean).length;
  return warnings > 0
    ? {
        status: "ready",
        summary: c.seoWarnings(warnings),
        badge: { text: c.seoCheck, tone: "warning" },
      }
    : { status: "ready", summary: c.seoWarnings(0) };
}

/**
 * Promo codes: what `/promo` shows now (the public «active» list — exactly
 * the page's source), and — when the session may read the admin list — how
 * many codes are still ticked for the page but already expired.
 */
export function promoCodesZoneState(
  active: readonly { code: string }[],
  admin: readonly DiscountEntity[] | undefined,
  now: number,
): ZoneState {
  const summary = c.promoShown(
    active.length,
    active.map((discount) => discount.code).join(", "),
  );
  const expired = (admin ?? []).filter(
    (discount) =>
      discount.showOnPromoPage &&
      discount.isActive &&
      time(discount.expiresAt) <= now,
  ).length;
  return expired > 0
    ? {
        status: "ready",
        summary,
        badge: { text: c.promoExpired(expired), tone: "warning" },
      }
    : { status: "ready", summary };
}
