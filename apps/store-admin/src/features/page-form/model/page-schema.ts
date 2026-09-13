import { z } from "zod";
import type { CreatePageDto, UpdatePageDto } from "@/entities/page";
import { dict, hubRouteForSlug } from "@/shared/config";
import { fromKyivDateTimeLocal } from "@/shared/lib";
import {
  KEYWORDS_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  parseKeywords,
} from "@/shared/lib/seo";

const e = dict.pageForm.errors;
const seoErrors = dict.seoFields.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const PAGE_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type PageStatus = (typeof PAGE_STATUS)[number];

/** Page kinds — mirror of the API's PageKind enum (TASK-435). */
export const PAGE_KIND = ["LEGAL", "INFO", "HUB"] as const;
export type PageKindValue = (typeof PAGE_KIND)[number];

/**
 * Validation schema for the admin page form.
 *
 * As in the category/product forms, the single numeric field (`sortOrder`) is
 * modelled as a string on the zod INPUT side (bound to a text input) and
 * transformed to a number on the OUTPUT side, so `react-hook-form` registration
 * stays string-only while `onSubmit` receives a parsed number.
 *
 * Publish control (TASK-187): `status` drives visibility; when it is
 * `SCHEDULED` a `scheduledAt` datetime is required (bound to a
 * `datetime-local` input; the empty string means "unset").
 *
 * `content` holds Tiptap HTML. An "empty" Tiptap document still serialises to
 * `<p></p>`, so emptiness is validated by stripping tags and whitespace.
 */
export const pageSchema = z
  .object({
    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    slug: z
      .string()
      .trim()
      .max(255, e.slugMax)
      .regex(SLUG_PATTERN, e.slugPattern)
      .optional()
      .or(z.literal("")),

    content: z
      .string()
      .refine(
        (html) => html.replace(/<[^>]*>/g, "").trim().length > 0,
        e.contentRequired,
      ),

    excerpt: z
      .string()
      .trim()
      .max(500, e.excerptMax)
      .optional()
      .or(z.literal("")),

    metaTitle: z
      .string()
      .trim()
      .max(255, e.metaTitleMax)
      .optional()
      .or(z.literal("")),

    metaDescription: z
      .string()
      .trim()
      .max(500, e.metaDescriptionMax)
      .optional()
      .or(z.literal("")),

    // TASK-437 — internal tags as one comma-separated field, validated on the
    // PARSED list (see the product form's twin).
    keywords: z
      .string()
      .optional()
      .refine(
        (raw) => parseKeywords(raw).length <= KEYWORDS_MAX_COUNT,
        seoErrors.keywordsCount(KEYWORDS_MAX_COUNT),
      )
      .refine(
        (raw) =>
          parseKeywords(raw).every((k) => k.length <= KEYWORD_MAX_LENGTH),
        seoErrors.keywordLength(KEYWORD_MAX_LENGTH),
      ),

    ogImage: z
      .string()
      .trim()
      .url(seoErrors.ogImageUrl)
      .optional()
      .or(z.literal("")),

    /**
     * TASK-428: NO LONGER RENDERED and NO LONGER SUBMITTED — the order is set by
     * dragging rows in the page list, and a new page is appended by the server.
     *
     * The key survives in the INPUT shape only because `widgets/page-form-view` still
     * seeds it (`sortOrder: String(page.sortOrder)`) and that widget is owned elsewhere;
     * dropping it here would break that object literal's excess-property check. Nothing
     * registers this field and `pageFormValuesToDto` no longer sends it, so the value is
     * inert. Delete it together with the mapper line in `widgets/page-form-view`.
     */
    sortOrder: z
      .string()
      .trim()
      .optional()
      .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    status: z.enum(PAGE_STATUS),

    kind: z.enum(PAGE_KIND),

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

    // TASK-435 — a HUB row's slug is not an address, it is the NAME of an
    // existing storefront section. Any other value saves a row that renders
    // nowhere: the API rejects it with a 400, and the form should never let the
    // operator get that far. The UI offers a picker, so this only fires on a
    // kind switched to HUB while a free-text slug from the previous kind is
    // still in the field.
    if (values.kind === "HUB" && !hubRouteForSlug(values.slug ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: e.hubSlugRequired,
      });
    }
  });

export type PageFormInput = z.input<typeof pageSchema>;
export type PageFormValues = z.output<typeof pageSchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug).
 * `scheduledAt` is only sent for a SCHEDULED page and is normalised to an ISO
 * instant; otherwise it is omitted (the backend clears it).
 */
export function pageFormValuesToCreateDto(
  values: PageFormValues,
): CreatePageDto {
  const slug = values.slug?.trim();
  const excerpt = values.excerpt?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();
  const ogImage = values.ogImage?.trim();

  // Read as KYIV wall-clock time. `new Date("YYYY-MM-DDTHH:mm")` — what stood
  // here — parses a zone-less datetime in the RUNTIME's zone, which contradicts
  // the Kyiv-pinned page list the operator read the date off in the first place.
  // See `shared/lib/format/datetime-local.ts`.
  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? fromKyivDateTimeLocal(values.scheduledAt)?.toISOString()
      : undefined;

  return {
    title: values.title,
    content: values.content,
    kind: values.kind,
    slug: slug ? slug : undefined,
    excerpt: excerpt ? excerpt : undefined,
    metaTitle: metaTitle ? metaTitle : undefined,
    metaDescription: metaDescription ? metaDescription : undefined,
    // TASK-437 — unlike the meta text above, these two CLEAR properly: a tag
    // list clears by being empty, and `ogImage` accepts an explicit null on both
    // verbs, so one mapper still serves create and update.
    keywords: parseKeywords(values.keywords),
    ogImage: ogImage ? ogImage : null,
    // `sortOrder` is deliberately NOT sent (TASK-428), and stays unsent through
    // this merge: develop's mapper still carried it, but the order is now set by
    // dragging rows in the page list. On create its absence is what makes the
    // server append the page to the END of the list; on update its absence
    // leaves the position the operator dragged the row to untouched — sending
    // the form's stale copy back would silently undo the drag on the next save.
    status: values.status,
    scheduledAt,
  };
}

/**
 * Update payload mirrors the create mapper — all fields are optional on the DTO.
 */
export function pageFormValuesToUpdateDto(
  values: PageFormValues,
): UpdatePageDto {
  return pageFormValuesToCreateDto(values);
}
