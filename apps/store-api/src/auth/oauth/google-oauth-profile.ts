/**
 * Clean, internal, library-agnostic shape of a Google sign-in profile
 * (TASK-168).
 *
 * Produced by `GoogleStrategy.validate()` (the one thin adapter that touches
 * `passport-google-oauth20`'s own `Profile` type) and consumed by
 * `AuthService.loginWithGoogleProfile()`. This seam is what lets the
 * account-resolution business logic be unit-tested with plain object
 * literals, fully decoupled from Passport/Express machinery.
 */
export interface GoogleOAuthProfile {
  /** Google's stable subject id (OIDC `sub` claim) — never the email. */
  providerId: string;
  /** Primary email, or null when Google did not grant the email scope. */
  email: string | null;
  /** Whether Google reports the email as verified. */
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  /** Sanitized same-origin path to land on after a successful sign-in. */
  redirect: string;
}
