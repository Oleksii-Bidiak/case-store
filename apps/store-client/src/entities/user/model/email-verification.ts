import type { UserEntity } from "@/shared/api/generated/models";

/**
 * Whether the account's email address has been proven (TASK-342).
 *
 * Three states, not two — `"unknown"` is load-bearing. See
 * {@link readEmailVerificationState}.
 */
export type EmailVerificationState = "verified" | "unverified" | "unknown";

/**
 * The profile response as it exists on the wire *today*, plus the field this
 * feature needs.
 *
 * `emailVerifiedAt` is a real column on `User` and the backend stamps it in
 * `AuthRepository.markEmailVerified`, but `UserEntity` (store-api) does not
 * serialise it, so `GET /api/users/me` never sends it and the generated model
 * has no such property. The intersection is how we read a field the contract
 * does not describe yet, in one place, with the reason written down — rather
 * than casting at each call site.
 */
type ProfileWithVerification = UserEntity & {
  /** ISO timestamp when the address was verified; `null` when it never was. */
  emailVerifiedAt?: string | null;
};

/**
 * Read verification state off a profile.
 *
 * **Absent must not be read as "unverified".** While store-api omits the field,
 * every profile would look unverified, and the UI would put a "confirm your
 * address" banner in front of users who confirmed theirs months ago — a warning
 * that is wrong for everyone is worse than no warning, because it teaches people
 * to ignore the next one. So a missing field yields `"unknown"` and the banner
 * renders nothing at all; `null` (explicitly never verified) is what turns it on.
 *
 * The moment `UserEntity.emailVerifiedAt` ships, the banner starts working with
 * no change here.
 */
export function readEmailVerificationState(
  user: Pick<UserEntity, "id"> & Partial<ProfileWithVerification>,
): EmailVerificationState {
  const verifiedAt = (user as ProfileWithVerification).emailVerifiedAt;

  if (verifiedAt === undefined) {
    return "unknown";
  }

  return verifiedAt === null ? "unverified" : "verified";
}
