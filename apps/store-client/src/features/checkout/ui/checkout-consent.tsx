"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { dict, LEGAL_OFFER_PATH, LEGAL_PRIVACY_PATH } from "@/shared/config";

interface CheckoutConsentProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Show the «прийміть умови» message — set by a blocked confirm. */
  showError: boolean;
}

const LINK_CLASS =
  "rounded-sm text-primary underline underline-offset-2 transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const CONSENT_ID = "checkout-consent";
const DOCS_ID = "checkout-consent-docs";
const ERROR_ID = "checkout-consent-error";

/**
 * CheckoutConsent — the offer + privacy consent on the confirm step (TASK-882,
 * `docs/legal-checklist.md` §1: "Чекбокс/текст на чекауті посилається на оферту
 * та політику конфіденційності").
 *
 * Placing the order is the acceptance of the public offer, so the box sits
 * right above «Підтвердити замовлення». It is required, and the requirement is
 * SAID, not implied: the confirm button stays enabled, and pressing it with the
 * box clear shows {@link dict.checkout.consent.required} as an alert tied to the
 * checkbox (`aria-invalid` + `aria-describedby`) while focus moves onto it. A
 * silently disabled button tells nobody why it does nothing — least of all on a
 * phone, where the button rides in the bottom bar far from this box.
 *
 * Markup follows the registration consent (TASK-871): the documents are named
 * AND linked, and the links sit outside the `<label>` — a link inside a label is
 * a second click target on one control, so a mis-tap would tick the box instead
 * of opening the document. They open a new tab so the filled form survives.
 *
 * Controlled from `CheckoutView` rather than registered on the form: the box
 * exists only on step 2, while the zod schema validates the whole form on the
 * step-1 «Далі» as well, where an unticked box must not block anything.
 */
export const CheckoutConsent = forwardRef<
  HTMLInputElement,
  CheckoutConsentProps
>(function CheckoutConsent({ checked, onCheckedChange, showError }, ref) {
  const d = dict.checkout.consent;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5 text-sm text-foreground">
        {/* The 16px box keeps the mockup's look; the label row beside it is
            the generous tap target. */}
        <input
          ref={ref}
          id={CONSENT_ID}
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? `${DOCS_ID} ${ERROR_ID}` : DOCS_ID}
        />
        <p>
          <label htmlFor={CONSENT_ID} className="cursor-pointer">
            {d.prefix}
          </label>{" "}
          <span id={DOCS_ID}>
            <Link
              href={LEGAL_OFFER_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {d.offerLink}
              <span className="sr-only"> {d.newTab}</span>
            </Link>
            {d.and}
            <Link
              href={LEGAL_PRIVACY_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {d.privacyLink}
              <span className="sr-only"> {d.newTab}</span>
            </Link>
          </span>
        </p>
      </div>
      {showError && (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {d.required}
        </p>
      )}
    </div>
  );
});
