"use client";

import { useId, type ComponentProps } from "react";
import { dict } from "@/shared/config";

/** The field the API treats as the honeypot (`CreateContactMessageDto.website`). */
export const CONTACT_HONEYPOT_FIELD = "website";

type ContactHoneypotProps = Pick<
  ComponentProps<"input">,
  "name" | "onChange" | "onBlur" | "ref"
>;

/**
 * ContactHoneypot — a bot trap for the contact forms (TASK-452).
 *
 * An input no person meets: clipped out of view (`sr-only`), removed from the
 * accessibility tree (`aria-hidden` on the wrapper — without it `sr-only` would
 * make a screen reader announce it), skipped by Tab (`tabIndex={-1}`) and by
 * autofill (`autoComplete="off"`). A form-filling bot types into every input it
 * finds, fills this one too, and the API then answers it exactly like a real
 * submission while storing nothing — so the bot has nothing to learn from.
 *
 * `sr-only` rather than `display: none` / `hidden`: the cheap bots skip inputs
 * that are not rendered at all, and those are the ones this is meant to catch.
 *
 * Spread RHF's `register(CONTACT_HONEYPOT_FIELD)` onto it. The form must send the
 * value only when non-empty, so a person's request carries no `website` key.
 */
export function ContactHoneypot(props: ContactHoneypotProps) {
  const id = useId();

  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={id}>{dict.contact.honeypotLabel}</label>
      <input id={id} type="text" tabIndex={-1} autoComplete="off" {...props} />
    </div>
  );
}
