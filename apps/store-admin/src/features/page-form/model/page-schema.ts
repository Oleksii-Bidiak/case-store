import { z } from "zod";
import type { CreatePageDto, UpdatePageDto } from "@/entities/page";
import { dict, hubRouteForSlug } from "@/shared/config";
import { SLUG_PATTERN } from "@/shared/lib/slug";
import { ogImageField, seoTextFields } from "@/shared/lib/seo-fields-schema";
import { fromKyivDateTimeLocal } from "@/shared/lib";
import {
  KEYWORDS_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  parseKeywords,
} from "@/shared/lib/seo";

const e = dict.pageForm.errors;
const seoErrors = dict.seoFields.errors;

/**
 * Mirror of the API's `MAX_RICH_TEXT_CONTENT_LENGTH`
 * (`apps/store-api/src/common/sanitize/rich-text.constants.ts`): the length of
 * the stored HTML a page body may have.
 */
export const MAX_PAGE_CONTENT_LENGTH = 100_000;

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const PAGE_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type PageStatus = (typeof PAGE_STATUS)[number];

/** Page kinds — mirror of the API's PageKind enum (TASK-435). */
export const PAGE_KIND = ["LEGAL", "INFO", "HUB"] as const;
export type PageKindValue = (typeof PAGE_KIND)[number];

/**
 * Validation schema for the admin page form.
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
      .regex(SLUG_PATTERN, dict.seoFields.errors.slugPattern)
      .optional()
      .or(z.literal("")),

    content: z
      .string()
      .refine(
        (html) => html.replace(/<[^>]*>/g, "").trim().length > 0,
        e.contentRequired,
      )
      // TASK-1154 — the API's `@MaxLength(MAX_RICH_TEXT_CONTENT_LENGTH)`
      // counts the stored HTML, so this does too; the message says by how much.
      .superRefine((html, ctx) => {
        const over = html.length - MAX_PAGE_CONTENT_LENGTH;
        if (over > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: dict.pageForm.contentMax(
              MAX_PAGE_CONTENT_LENGTH.toLocaleString("uk-UA"),
              over.toLocaleString("uk-UA"),
            ),
          });
        }
      }),

    excerpt: z
      .string()
      .trim()
      .max(500, e.excerptMax)
      .optional()
      .or(z.literal("")),

    ...seoTextFields(),

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

    ogImage: ogImageField(),

    // No `sortOrder` (TASK-428, removed from the schema by TASK-729): the order is
    // set by dragging rows in the page list, and a new page is appended by the server.

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
