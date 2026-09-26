"use client";

import { useId, type ComponentProps } from "react";

type HoneypotProps = Pick<
  ComponentProps<"input">,
  "name" | "onChange" | "onBlur" | "ref"
> & {
  /** Label text. For DOM-reading bots only — no person ever meets it. */
  label: string;
};

/**
 * Honeypot — a bot trap input no person meets (TASK-452, shared by TASK-749).
 *
 * Clipped out of view (`sr-only`), out of the accessibility tree, out of reach
 * of every kind of focus, and refused to autofill.
 *
 * `inert` AND `aria-hidden` on the wrapper, not one of them. `aria-hidden`
 * alone hides the field from a screen reader but leaves it focusable — which is
 * both the axe `aria-hidden-focus` pattern and a real hole, since `tabIndex=-1`
 * stops Tab and nothing else. `inert` closes that hole (no focus, no pointer,
 * no a11y tree) and makes the pair legitimate; `aria-hidden` stays because it
 * is what any engine that does not implement `inert` still understands.
 *
 * Autofill needs more than `autoComplete="off"`: Chrome's profile autofill may
 * ignore `autocomplete="off"` outright, and password managers match fields by
 * NAME. The `data-*` opt-outs below are what 1Password, LastPass and Bitwarden
 * actually read. The name matters just as much — see the caller's constant:
 * `website` (the contact form's, fixed by the API contract) is a real slot in
 * 1Password "Internet Details", Bitwarden identities and Safari cards, which is
 * why new traps use a name no filler has a profile slot for.
 *
 * `sr-only` rather than `display: none` / `hidden`: the cheap bots skip inputs
 * that are not rendered at all, and those are the ones this is meant to catch.
 *
 * Spread RHF's `register(<field>)` onto it. The form must send the value only
 * when non-empty, so a person's request carries no key for it.
 */
export function Honeypot({ label, ...props }: HoneypotProps) {
  const id = useId();

  return (
    <div inert aria-hidden="true" className="sr-only">
      <label htmlFor={id}>{label}</label>
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
