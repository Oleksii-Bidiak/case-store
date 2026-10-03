import { z } from "zod";
import type {
  SiteContactSettingsEntity,
  UpdateSiteContactDto,
} from "@/entities/site-contact";
import { dict } from "@/shared/config";

const e = dict.siteContactForm.errors;

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
  email: z.string().trim().min(1, e.emailRequired).email(e.emailInvalid),

  phone: z.string().trim().min(1, e.phoneRequired).max(50),

  workingHours: z.string().trim().max(255).optional().or(z.literal("")),

  viberLink: z.string().trim().url(e.urlInvalid).optional().or(z.literal("")),

  telegramLink: z
    .string()
    .trim()
    .url(e.urlInvalid)
    .optional()
    .or(z.literal("")),

  instagramLink: z
    .string()
    .trim()
    .url(e.urlInvalid)
    .optional()
    .or(z.literal("")),
});

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
