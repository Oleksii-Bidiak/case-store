"use client";

import { useAuthControllerRequestEmailVerification } from "@/entities/session";
import { readEmailVerificationState, type UserEntity } from "@/entities/user";
import { dict } from "@/shared/config";

/**
 * AccountEmailVerification — verification state for the signed-in user's address,
 * shown above the contact card in `/account` (TASK-342).
 *
 * Renders **nothing** when the state is `"unknown"` — see
 * `readEmailVerificationState`: the profile endpoint does not expose
 * `emailVerifiedAt` yet, and warning every user that their confirmed address is
 * unconfirmed would be worse than staying quiet.
 *
 * The resend result is worded conditionally ("if the address is not yet
 * confirmed…") because the endpoint answers 200 with one generic message for an
 * already-verified, banned, or missing account — it refuses to confirm or deny,
 * so neither can we.
 */
export function AccountEmailVerification({ user }: { user: UserEntity }) {
  const state = readEmailVerificationState(user);
  const resend = useAuthControllerRequestEmailVerification();
  const d = dict.auth.verifyEmail;

  if (state === "unknown") {
    return null;
  }

  if (state === "verified") {
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <CheckIcon />
        {d.bannerVerified}
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-6 shadow-card">
      <h2 className="mb-1.5 text-lg font-semibold text-foreground">
        {d.bannerUnverifiedTitle}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {d.bannerUnverifiedBody}
      </p>

      <button
        type="button"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resend.isPending ? d.resending : d.resend}
      </button>

      {resend.isSuccess && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {d.resendSuccess}
        </p>
      )}
      {resend.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {d.resendError}
        </p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
