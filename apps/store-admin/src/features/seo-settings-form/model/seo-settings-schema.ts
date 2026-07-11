import { z } from "zod";
import type {
  SeoSettingsEntity,
  UpdateSeoSettingsDto,
} from "@/entities/seo-settings";
import { dict } from "@/shared/config";

const e = dict.seoSettingsForm.errors;

/** Parse a newline-separated textarea value into a trimmed, blank-free list. */
export function parseSameAsLinks(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Accepts either a bare verification token or a full `<meta ...>` tag copy-pasted
 * from a search console's "HTML tag" instructions, and returns just the token (the
 * `content` attribute value). Falls back to a plain trim when no `content=` attribute
 * is found, so a bare token — the expected common case — passes through unchanged.
 *
 * Intentionally duplicated (not import-shared) with store-api's
 * `seo-settings/dto/update-seo-settings.dto.ts` — the two apps share no logic
 * package (same choice as `resolve-seo-preview.ts`, TASK-268). Keep both copies
 * in sync. See plan 146 Design Decision 1.
 */
export function normalizeSiteVerificationValue(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/content=["']([^"']+)["']/i);
  return match ? match[1] : trimmed;
}

/** True when `value` is a syntactically valid http(s) URL. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validation schema for the singleton SEO-settings form.
 *
 * Text fields use the same blank-to-clear pattern as site-contact: an empty
 * string is valid (the field is simply not sent), a non-empty value must satisfy
 * its format. `noindexSite` is a boolean checkbox. `additionalSameAsLinks` is a
 * single newline-separated textarea (Decision 4) — validated line-by-line as a
 * URL, then split into an array by the mapper.
 */
export const seoSettingsSchema = z.object({
  defaultMetaTitle: z
    .string()
    .trim()
    .max(255, e.metaTitleTooLong)
    .optional()
    .or(z.literal("")),

  defaultMetaDescription: z
    .string()
    .trim()
    .max(500, e.metaDescriptionTooLong)
    .optional()
    .or(z.literal("")),

  titleTemplate: z
    .string()
    .trim()
    .max(255, e.titleTemplateTooLong)
    .refine((v) => !v || /^[^%]*%s[^%]*$/.test(v), e.titleTemplateNoToken)
    .optional()
    .or(z.literal("")),

  defaultOgImage: z
    .string()
    .trim()
    .url(e.urlInvalid)
    .optional()
    .or(z.literal("")),

  googleSiteVerification: z
    .string()
    .trim()
    .max(255, e.siteVerificationTooLong)
    .optional()
    .or(z.literal("")),

  bingSiteVerification: z
    .string()
    .trim()
    .max(255, e.siteVerificationTooLong)
    .optional()
    .or(z.literal("")),

  noindexSite: z.boolean(),

  llmsTxtSummary: z
    .string()
    .trim()
    .max(2000, e.llmsTxtSummaryTooLong)
    .optional()
    .or(z.literal("")),

  additionalSameAsLinks: z
    .string()
    .refine((raw) => parseSameAsLinks(raw).every(isHttpUrl), e.sameAsInvalid),
});

export type SeoSettingsFormInput = z.input<typeof seoSettingsSchema>;
export type SeoSettingsFormValues = z.output<typeof seoSettingsSchema>;

/**
 * Map parsed form values to the update payload. Blank text fields are dropped so
 * the backend treats them as "not provided" (an empty string would fail the
 * `@IsUrl()` validator on `defaultOgImage`). `noindexSite` and
 * `additionalSameAsLinks` are always sent (a boolean and an array clear cleanly).
 */
export function seoSettingsFormValuesToDto(
  values: SeoSettingsFormValues,
): UpdateSeoSettingsDto {
  const clean = (v?: string) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  };

  // Defense-in-depth half of plan 146 Design Decision 1: the form already
  // normalizes on blur, but a paste-then-immediate-submit skips the blur
  // event, so the pasted full <meta> tag is normalized here again.
  const cleanVerification = (v?: string) =>
    clean(normalizeSiteVerificationValue(v ?? ""));

  return {
    defaultMetaTitle: clean(values.defaultMetaTitle),
    defaultMetaDescription: clean(values.defaultMetaDescription),
    titleTemplate: clean(values.titleTemplate),
    defaultOgImage: clean(values.defaultOgImage),
    googleSiteVerification: cleanVerification(values.googleSiteVerification),
    bingSiteVerification: cleanVerification(values.bingSiteVerification),
    noindexSite: values.noindexSite,
    llmsTxtSummary: clean(values.llmsTxtSummary),
    additionalSameAsLinks: parseSameAsLinks(values.additionalSameAsLinks),
  };
}

/**
 * Map a fetched settings entity onto the form's input shape, converting `null`
 * fields to `""` so the controlled inputs stay defined and joining the sameAs
 * link array back into one URL-per-line textarea value.
 */
export function mapSettingsToFormValues(
  settings: SeoSettingsEntity,
): SeoSettingsFormInput {
  return {
    defaultMetaTitle: settings.defaultMetaTitle ?? "",
    defaultMetaDescription: settings.defaultMetaDescription ?? "",
    titleTemplate: settings.titleTemplate ?? "",
    defaultOgImage: settings.defaultOgImage ?? "",
    googleSiteVerification: settings.googleSiteVerification ?? "",
    bingSiteVerification: settings.bingSiteVerification ?? "",
    noindexSite: settings.noindexSite ?? false,
    llmsTxtSummary: settings.llmsTxtSummary ?? "",
    additionalSameAsLinks: (settings.additionalSameAsLinks ?? []).join("\n"),
  };
}
