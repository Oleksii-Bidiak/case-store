import { z } from "zod";
import { dict } from "@/shared/config";
import { optionalHttpUrl } from "./http-url";

const seoErrors = dict.seoFields.errors;

/** Caps of the SEO text overrides — mirror the API DTOs' `@MaxLength`. */
export const META_TITLE_MAX_LENGTH = 255;
export const META_DESCRIPTION_MAX_LENGTH = 500;

/**
 * The `metaTitle` / `metaDescription` pair of an entity form (TASK-811).
 *
 * Five form schemas (product, category, page, blog post, device model) used to
 * spell this block out by hand, each with its own copy of the two error
 * strings. Spread it into the object schema:
 *
 * ```ts
 * z.object({ name: …, ...seoTextFields() })
 * ```
 *
 * INPUT is free text; OUTPUT is the trimmed string, `""` for a blank field.
 * What blank MEANS stays with each form's mapper, because it differs on
 * purpose: on update most mappers turn it into an explicit `null` (clear the
 * override, TASK-245/TASK-490), while the page mapper still omits it. The
 * schema only decides what is valid.
 */
export function seoTextFields() {
  return {
    metaTitle: z
      .string()
      .trim()
      .max(META_TITLE_MAX_LENGTH, seoErrors.metaTitleMax)
      .optional()
      .or(z.literal("")),
    metaDescription: z
      .string()
      .trim()
      .max(META_DESCRIPTION_MAX_LENGTH, seoErrors.metaDescriptionMax)
      .optional()
      .or(z.literal("")),
  };
}

/**
 * The entity forms' «Картинка для соцмереж (OG)» field (TASK-573): blank, or
 * an http(s) URL. `javascript:` / `data:` get the hint under the field instead
 * of a generic 400 from the API.
 */
export function ogImageField() {
  return optionalHttpUrl(seoErrors.ogImageUrl);
}
