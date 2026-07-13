import { z } from "zod";
import type { CreateCarouselDto, UpdateCarouselDto } from "@/entities/carousel";
import { dict } from "@/shared/config";

const e = dict.carouselForm.errors;

/** Product-list sources — mirror of the API's CarouselSource enum. */
export const CAROUSEL_SOURCE = [
  "BESTSELLING",
  "NEWEST",
  "ON_SALE",
  "CATEGORY",
  "MANUAL",
] as const;
export type CarouselSourceValue = (typeof CAROUSEL_SOURCE)[number];

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const CAROUSEL_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type CarouselStatusValue = (typeof CAROUSEL_STATUS)[number];

/**
 * Where the carousel renders on the storefront home page (TASK-288) — mirror of
 * the API's CarouselPlacement enum. Declared locally rather than imported from
 * the generated models because Orval emits a SEPARATE enum per schema
 * (`CreateCarouselDtoPlacement`, `CarouselEntityPlacement`, …) with no shared
 * union — the same reason `CAROUSEL_SOURCE`/`CAROUSEL_STATUS` are local consts.
 */
export const CAROUSEL_PLACEMENT = ["HOME_TABS", "HOME_RAILS"] as const;
export type CarouselPlacementValue = (typeof CAROUSEL_PLACEMENT)[number];

/**
 * Validation schema for the admin carousel form.
 *
 * Mirrors `bannerSchema`'s conventions: numeric fields (`itemLimit`,
 * `sortOrder`) are modelled as strings on the INPUT side (bound to text/number
 * inputs) and transformed to numbers on the OUTPUT side; `status = SCHEDULED`
 * requires a `scheduledAt` datetime. One extra conditional rule on top of the
 * banner precedent: `source = CATEGORY` requires a selected `categoryId`
 * (mirrors the backend DTO's `@ValidateIf`).
 */
export const carouselSchema = z
  .object({
    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    source: z.enum(CAROUSEL_SOURCE),

    placement: z.enum(CAROUSEL_PLACEMENT),

    // Selected category UUID, or empty string when unset. Only meaningful (and
    // required — see superRefine) when `source` is CATEGORY.
    categoryId: z.string().optional().or(z.literal("")),

    itemLimit: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) =>
          v === undefined ||
          v === "" ||
          (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 24),
        e.itemLimitRange,
      )
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    sortOrder: z
      .string()
      .trim()
      .optional()
      .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    status: z.enum(CAROUSEL_STATUS),

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
    if (values.source === "CATEGORY" && !values.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: e.categoryRequired,
      });
    }
  });

export type CarouselFormInput = z.input<typeof carouselSchema>;
export type CarouselFormValues = z.output<typeof carouselSchema>;

/**
 * Map parsed form values to a create payload. `categoryId` is only sent for a
 * CATEGORY carousel (the backend nulls it for any other source anyway);
 * `scheduledAt` is only sent for a SCHEDULED carousel, normalised to an ISO
 * instant; blank optional numerics are omitted so backend defaults apply.
 */
export function carouselFormValuesToCreateDto(
  values: CarouselFormValues,
): CreateCarouselDto {
  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? new Date(values.scheduledAt).toISOString()
      : undefined;

  return {
    title: values.title,
    source: values.source,
    placement: values.placement,
    categoryId:
      values.source === "CATEGORY" && values.categoryId
        ? values.categoryId
        : undefined,
    itemLimit: values.itemLimit,
    sortOrder: values.sortOrder,
    status: values.status,
    scheduledAt,
  };
}

/**
 * Update payload mirrors the create mapper — all fields are optional on the DTO.
 */
export function carouselFormValuesToUpdateDto(
  values: CarouselFormValues,
): UpdateCarouselDto {
  return carouselFormValuesToCreateDto(values);
}
