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
 * An input no person meets: clipped out of view (`sr-only`), out of the
 * accessibility tree, out of reach of every kind of focus, and refused to
 * autofill.
 *
 * `inert` AND `aria-hidden` on the wrapper, not one of them. `aria-hidden`
 * alone hides the field from a screen reader but leaves it focusable — which is
 * both the axe `aria-hidden-focus` pattern and a real hole, since `tabIndex=-1`
 * stops Tab and nothing else. `inert` closes that hole (no focus, no pointer,
 * no a11y tree) and makes the pair legitimate; `aria-hidden` stays because it
 * is what any engine that does not implement `inert` still understands. The
 * label below is therefore for DOM-reading bots only, never for a person.
 *
 * Autofill needs more than `autoComplete="off"`: `website` is a real field in
 * 1Password's "Internet Details", in Bitwarden identities and in Safari cards,
 * and Chrome's profile autofill is allowed to ignore `autocomplete="off"`
 * outright. The `data-*` opt-outs below are what those fillers actually read —
 * without them a customer who accepts an identity suggestion fills the trap and
 * their message is discarded in silence.
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
    <div inert aria-hidden="true" className="sr-only">
      <label htmlFor={id}>{dict.contact.honeypotLabel}</label>
      <input
        id={id}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        {...props}
      />
    </div>
  );
}
