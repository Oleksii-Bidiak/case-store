"use client";

import type { ComponentProps } from "react";
import { dict } from "@/shared/config";
import { Honeypot } from "@/shared/ui";

/**
 * The field the API treats as the honeypot (`CreateContactMessageDto.website`).
 *
 * A semantic name, and a known risk: `website` is a real field in 1Password's
 * "Internet Details", Bitwarden identities and Safari cards. It stays because it
 * is the published API contract of `POST /api/contact`; the opt-out attributes
 * on `Honeypot` are what keeps those fillers out, and since TASK-761 a hit is
 * stored as SPAM rather than dropped, so a false positive can be seen. New traps
 * (registration, TASK-749) use a name no filler has a slot for.
 */
export const CONTACT_HONEYPOT_FIELD = "website";

type ContactHoneypotProps = Pick<
  ComponentProps<"input">,
  "name" | "onChange" | "onBlur" | "ref"
>;

/**
 * ContactHoneypot — the contact forms' bot trap (TASK-452): the shared
 * `Honeypot` (see it for why every attribute is there) with the contact label.
 *
 * Spread RHF's `register(CONTACT_HONEYPOT_FIELD)` onto it.
 */
export function ContactHoneypot(props: ContactHoneypotProps) {
  return <Honeypot label={dict.contact.honeypotLabel} {...props} />;
}
