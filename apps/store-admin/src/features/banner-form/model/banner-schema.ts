import { z } from "zod";
import type { CreateBannerDto, UpdateBannerDto } from "@/entities/banner";
import { dict } from "@/shared/config";

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
  })
  .superRefine((values, ctx) => {
    if (values.status === "SCHEDULED" && !values.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: e.scheduledAtRequired,
      });
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

  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? new Date(values.scheduledAt).toISOString()
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
