import * as React from "react";
import { CircleCheckIcon, CircleIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { PASSWORD_MIN_LENGTH } from "@/shared/lib/password-policy";
import { dict } from "@/shared/config";

/**
 * The STAFF password rule, split into the parts the server checks (wave 198,
 * Profile П3). Mirrors `shared/lib/password-policy` — itself the mirror of
 * `apps/store-api/src/common/validators/password-policy.decorator.ts` — so the
 * Unicode classes are the same: «Пароль12» satisfies «Велика літера» here
 * exactly as it does on the server. Change the three together.
 */
const RULES = [
  {
    label: dict.canon.passwordMinLength(PASSWORD_MIN_LENGTH),
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    label: dict.canon.passwordUppercase,
    test: (value: string) => /\p{Lu}/u.test(value),
  },
  {
    label: dict.canon.passwordLowercase,
    test: (value: string) => /\p{Ll}/u.test(value),
  },
  {
    label: dict.canon.passwordDigit,
    test: (value: string) => /\d/.test(value),
  },
] as const;

export interface PasswordRequirementsProps {
  value: string;
  className?: string;
}

/**
 * Live ✓ / ○ checklist in two columns. Not a live region: re-announcing four
 * lines on every keystroke would drown the field. Each line says «виконано» /
 * «ще ні» in text, so the state is not carried by colour or icon alone.
 */
export function PasswordRequirements({
  value,
  className,
}: PasswordRequirementsProps) {
  return (
    <ul
      aria-label={dict.canon.passwordRequirementsLabel}
      className={cn("grid grid-cols-2 gap-x-4 gap-y-1 text-xs", className)}
    >
      {RULES.map((rule) => {
        const met = rule.test(value);
        const Icon = met ? CircleCheckIcon : CircleIcon;
        return (
          <li
            key={rule.label}
            data-met={met}
            className={cn(
              "flex items-center gap-1.5",
              met ? "text-success" : "text-muted-foreground",
            )}
          >
            <span>{rule.label}</span>
            <Icon
              aria-hidden="true"
              className="order-first size-3.5 shrink-0"
            />
            <span className="sr-only">
              {`: ${met ? dict.canon.requirementMet : dict.canon.requirementUnmet}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
