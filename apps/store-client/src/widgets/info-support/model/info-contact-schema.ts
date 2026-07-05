import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Validation schema for the compact info-page contact form. Mirrors the backend
 * `CreateContactMessageDto` for the fields this form collects (name / phone /
 * email / message). Topic and orderRef are not collected here — the backend
 * stores them as null.
 */
export const infoContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, dict.contact.errors.nameRequired)
    .max(120, dict.contact.errors.nameRequired),
  phone: z
    .string()
    .trim()
    .min(5, dict.contact.errors.phoneRequired)
    .max(32, dict.contact.errors.phoneRequired),
  email: z
    .string()
    .trim()
    .email(dict.contact.errors.emailInvalid)
    .max(255, dict.contact.errors.emailInvalid),
  message: z
    .string()
    .trim()
    .min(10, dict.contact.errors.messageRequired)
    .max(5000, dict.contact.errors.messageRequired),
});

export type InfoContactFormValues = z.infer<typeof infoContactSchema>;
