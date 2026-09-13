import { z } from "zod";
import type { CreateBannerDto, UpdateBannerDto } from "@/entities/banner";
import { dict } from "@/shared/config";
import { fromKyivDateTimeLocal } from "@/shared/lib";

const e = dict.bannerForm.errors;

/** Placement slots — mirror of the API's BannerPlacement enum. */
export const BANNER_PLACEMENT = [
  "HERO_SLIDE",
  "PROMO_TILE",
  "PROMO_BANNER",
  "ANNOUNCEMENT_BAR",
] as const;
export type BannerPlacementValue = (typeof BANNER_PLACEMENT)[number];

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const BANNER_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type BannerStatusValue = (typeof BANNER_STATUS)[number];

/**
 * Validation schema for the admin banner form.
 *
 * Banners are STRUCTURED content — plain title / subtitle / CTA strings, not
 * Tiptap HTML — so there is no rich-text field.
 *
 * TASK-295: no `sortOrder` field either — a banner's position inside its
 * placement is set by dragging (or keyboard-moving) rows in that placement's
 * grid, and a new banner is appended to the bucket by the backend.
 *
 * Publish control (TASK-187): `status` drives visibility; when it is
 * `SCHEDULED` a `scheduledAt` datetime is required (bound to a
 * `datetime-local` input; the empty string means "unset").
 *
 * TASK-429 turns that single instant into a WINDOW: `scheduledUntil` is when the
 * banner comes back down on its own. Optional everywhere, and never compared
 * against the wall clock here — an end in the past is the scheduler's business,
 * not a reason to refuse the save.
 */
export const bannerSchema = z
  .object({
    placement: z.enum(BANNER_PLACEMENT),

    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    subtitle: z
      .string()
      .trim()
      .max(500, e.subtitleMax)
      .optional()
      .or(z.literal("")),

    imageUrl: z
      .string()
      .trim()
      .max(2048, e.imageUrlMax)
      .optional()
      .or(z.literal("")),

    ctaLabel: z
      .string()
      .trim()
      .max(100, e.ctaLabelMax)
      .optional()
      .or(z.literal("")),

    ctaHref: z
      .string()
      .trim()
      .max(2048, e.ctaHrefMax)
      .optional()
      .or(z.literal("")),

    theme: z.string().trim().max(50, e.themeMax).optional().or(z.literal("")),

    status: z.enum(BANNER_STATUS),

    // `datetime-local` value ("YYYY-MM-DDTHH:mm") or empty string when unset.
    scheduledAt: z.string().optional().or(z.literal("")),

    // TASK-429: the OTHER end of the publication window — when the scheduler
    // takes the banner back down. Always optional (empty = no end), and offered
    // for PUBLISHED as well as SCHEDULED: «показати зараз, зняти 1-го» is the
    // common case, and it has no start date at all.
    scheduledUntil: z.string().optional().or(z.literal("")),
  })
  .superRefine((values, ctx) => {
    if (values.status === "SCHEDULED" && !values.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: e.scheduledAtRequired,
      });
    }

    // Mirrors the DTO's `PublicationWindowConstraint`: an end before (or at) the
    // start is not a window. Only checked when BOTH ends exist — a lone end means
    // "from now until then".
    //
    // Resolved through `fromKyivDateTimeLocal`, not `Date.parse`, for the same
    // reason as the mappers below: a zone-less datetime string is parsed in the
    // RUNTIME's zone. Ordering two such strings usually survives that, but not
    // across a DST switch — Kyiv's 29-03-2026 03:00 does not exist, and a
    // browser whose own switch falls on another date would order the pair
    // differently from the server that ultimately judges the window.
    if (values.scheduledAt && values.scheduledUntil) {
      const start = fromKyivDateTimeLocal(values.scheduledAt)?.getTime();
      const until = fromKyivDateTimeLocal(values.scheduledUntil)?.getTime();
      if (start !== undefined && until !== undefined && until <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scheduledUntil"],
          message: e.scheduledUntilBeforeStart,
        });
      }
    }
  });

export type BannerFormInput = z.input<typeof bannerSchema>;
export type BannerFormValues = z.output<typeof bannerSchema>;

/**
 * Map parsed form values to a create payload, dropping blank optional strings so
 * the backend treats them as "not provided". `scheduledAt` is only sent for a
 * SCHEDULED banner and is normalised to an ISO instant; otherwise it is omitted.
 */
export function bannerFormValuesToCreateDto(
  values: BannerFormValues,
): CreateBannerDto {
  const subtitle = values.subtitle?.trim();
  const imageUrl = values.imageUrl?.trim();
  const ctaLabel = values.ctaLabel?.trim();
  const ctaHref = values.ctaHref?.trim();
  const theme = values.theme?.trim();

  // The `datetime-local` value is read as KYIV wall-clock time, not as the
  // browser's. `new Date("YYYY-MM-DDTHH:mm")` — what stood here — parses a
  // zone-less datetime in the RUNTIME's zone, so an operator on a CET laptop who
  // typed the date the banner LIST showed them (that list is Kyiv-pinned) stored
  // an instant two hours early and the banner went live a day before the list
  // said it would. See `shared/lib/format/datetime-local.ts`.
  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? fromKyivDateTimeLocal(values.scheduledAt)?.toISOString()
      : undefined;

  // TASK-429: the window end travels for BOTH live states — a DRAFT has nothing to
  // take down, and the backend clears it there anyway, so sending it would only
  // invite an inverted-window 400 on a banner nobody can see.
  const scheduledUntil =
    values.status !== "DRAFT" && values.scheduledUntil
      ? fromKyivDateTimeLocal(values.scheduledUntil)?.toISOString()
      : undefined;

  return {
    placement: values.placement,
    title: values.title,
    subtitle: subtitle ? subtitle : undefined,
    imageUrl: imageUrl ? imageUrl : undefined,
    ctaLabel: ctaLabel ? ctaLabel : undefined,
    ctaHref: ctaHref ? ctaHref : undefined,
    theme: theme ? theme : undefined,
    status: values.status,
    scheduledAt,
    scheduledUntil,
  };
}

/**
 * Update payload mirrors the create mapper — all fields are optional on the DTO.
 */
export function bannerFormValuesToUpdateDto(
  values: BannerFormValues,
): UpdateBannerDto {
  return bannerFormValuesToCreateDto(values);
}
