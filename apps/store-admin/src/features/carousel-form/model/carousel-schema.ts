import { z } from "zod";
import type { CreateCarouselDto, UpdateCarouselDto } from "@/entities/carousel";
import { dict } from "@/shared/config";
import { fromKyivDateTimeLocal } from "@/shared/lib";

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
 * Validation schema for the admin carousel form.
 *
 * Mirrors `bannerSchema`'s conventions: the numeric field (`itemLimit`) is
 * modelled as a string on the INPUT side (bound to a text/number input) and
 * transformed to a number on the OUTPUT side; `status = SCHEDULED`
 * requires a `scheduledAt` datetime. One extra conditional rule on top of the
 * banner precedent: `source = CATEGORY` requires a selected `categoryId`
 * (mirrors the backend DTO's `@ValidateIf`).
 */
export const carouselSchema = z
  .object({
    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    source: z.enum(CAROUSEL_SOURCE),

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

    // No `sortOrder` (TASK-428, removed from the schema by TASK-729): the order is
    // set by dragging rows in the carousel list, and a new carousel is appended to
    // the end of the list by the server. Where it shows on the homepage is not a
    // carousel field at all since TASK-660 — the «Головна» screen's blocks decide.

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
  // Read as KYIV wall-clock time. `new Date("YYYY-MM-DDTHH:mm")` — what stood
  // here — parses a zone-less datetime in the RUNTIME's zone, which contradicts
  // the Kyiv-pinned carousel list the operator read the date off in the first
  // place. See `shared/lib/format/datetime-local.ts`.
  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? fromKyivDateTimeLocal(values.scheduledAt)?.toISOString()
      : undefined;

  return {
    title: values.title,
    source: values.source,
    categoryId:
      values.source === "CATEGORY" && values.categoryId
        ? values.categoryId
        : undefined,
    itemLimit: values.itemLimit,
    // `sortOrder` is deliberately NOT sent (TASK-428). On create its absence is what
    // makes the server append the carousel to the END of the list; on update
    // its absence leaves the position the operator dragged the row to untouched.
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
