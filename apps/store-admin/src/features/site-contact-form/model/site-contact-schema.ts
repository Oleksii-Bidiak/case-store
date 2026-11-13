import { z } from "zod";
import type {
  SiteContactSettingsEntity,
  UpdateSiteContactDto,
} from "@/entities/site-contact";
import { dict } from "@/shared/config";
import { isHttpUrl } from "@/shared/lib/http-url";
import { emailField } from "@/shared/lib/form-fields";
import { phoneField } from "@/shared/lib/phone-field";

const e = dict.siteContactForm.errors;

/**
 * The `@MaxLength`s of `apps/store-api/src/site-contact/dto/update-site-contact.dto.ts`
 * (forms convention Rule 5d) — the inputs carry the same `maxLength`.
 */
export const SITE_CONTACT_LIMITS = {
  phone: 50,
  workingHours: 255,
  link: 500,
} as const;

/**
 * A messenger link: optional, http(s) only and at most 500 characters, as the
 * DTO's `@IsUrl({ protocols: ["http", "https"] }) @MaxLength(500)` (TASK-1984).
 * zod's `.url()` accepts any scheme — `javascript:alert(1)` passed it.
 */
const linkField = z
  .string()
  .trim()
  .max(SITE_CONTACT_LIMITS.link, dict.forms.tooLong)
  .refine((value) => value === "" || isHttpUrl(value), e.urlInvalid);

/**
 * Validation schema for the singleton site-contact settings form.
 *
 * Every field is bound to a text `<Input>`. Email and phone are required
 * (TASK-1053); the rest are optional — an empty string is valid (the field is
 * simply not sent), while a non-empty value must satisfy the email / URL format. The `.or(z.literal(""))`
 * pattern keeps the inputs controlled-string-only for react-hook-form.
 */
export const siteContactSchema = z.object({
  // TASK-1053 (Н1): the support email and the phone are required — they are
  // how a buyer reaches the shop. (Blank never cleared them anyway: a blank is
  // "not sent", and the API leaves a field it was not sent as it is.)
  // Stricter than the DTO on purpose (Rule 5f): the API leaves both optional,
  // but blank is "not sent", so TASK-1053 requires them here.
  email: z
    .string()
    .trim()
    .min(1, e.emailRequired)
    .pipe(emailField({ message: e.emailInvalid })),

  // TASK-1984 (Rule 5a): the DTO is `@IsInternationalPhone` — the shop's own
  // number may be a 0 800 or a foreign line, stored as typed — no
  // `normalizePhone` on the DTO, so the typed digits are counted.
  phone: z
    .string()
    .trim()
    .min(1, e.phoneRequired)
    .max(SITE_CONTACT_LIMITS.phone, dict.forms.tooLong)
    .pipe(phoneField({ rule: "international", normalized: false })),

  workingHours: z
    .string()
    .trim()
    .max(SITE_CONTACT_LIMITS.workingHours, dict.forms.tooLong)
    .optional()
    .or(z.literal("")),

  viberLink: linkField.optional(),
  telegramLink: linkField.optional(),
  instagramLink: linkField.optional(),
});

/** DTO path → form field for a server 400 (Rule 6b): the names are the same. */
export const SITE_CONTACT_FIELD_MAP = {
  email: "email",
  phone: "phone",
  workingHours: "workingHours",
  viberLink: "viberLink",
  telegramLink: "telegramLink",
  instagramLink: "instagramLink",
} as const;

export type SiteContactFormInput = z.input<typeof siteContactSchema>;
export type SiteContactFormValues = z.output<typeof siteContactSchema>;

/**
 * Map parsed form values to the update payload, dropping blank strings so the
 * backend treats them as "not provided" (an empty string would otherwise fail
 * the `@IsEmail()` / `@IsUrl()` validators).
 */
export function siteContactFormValuesToDto(
  values: SiteContactFormValues,
): UpdateSiteContactDto {
  const clean = (v?: string) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  };

  return {
    email: clean(values.email),
    phone: clean(values.phone),
    workingHours: clean(values.workingHours),
    viberLink: clean(values.viberLink),
    telegramLink: clean(values.telegramLink),
    instagramLink: clean(values.instagramLink),
  };
}

/**
 * Map a fetched settings entity onto the form's string-based input shape,
 * converting `null` fields to `""` so the controlled inputs stay defined.
 */
export function mapSettingsToFormValues(
  settings: SiteContactSettingsEntity,
): SiteContactFormInput {
  return {
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    workingHours: settings.workingHours ?? "",
    viberLink: settings.viberLink ?? "",
    telegramLink: settings.telegramLink ?? "",
    instagramLink: settings.instagramLink ?? "",
  };
}
