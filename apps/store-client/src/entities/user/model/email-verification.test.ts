import type { UserEntity } from "@/shared/api/generated/models";
import { readEmailVerificationState } from "./email-verification";

/**
 * A profile as `GET /api/users/me` returns it.
 *
 * It now carries `emailVerifiedAt` — the field was missing when this helper was
 * written, which is exactly why `readEmailVerificationState` has an "unknown"
 * state at all. That state is still worth keeping and still tested: an older
 * cached response, or a future endpoint that omits the field, must leave the
 * banner silent rather than telling a long-verified user to verify again.
 */
function makeProfile(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: "user-1",
    email: "oleg@example.com",
    firstName: "Олег",
    lastName: "Коваль",
    phone: "+380501234567",
    role: "CUSTOMER",
    isActive: true,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("readEmailVerificationState", () => {
  it("reports 'unverified' when the field is explicitly null", () => {
    expect(
      readEmailVerificationState({ ...makeProfile(), emailVerifiedAt: null }),
    ).toBe("unverified");
  });

  it("reports 'verified' when a timestamp is present", () => {
    expect(
      readEmailVerificationState({
        ...makeProfile(),
        emailVerifiedAt: "2026-07-01T10:00:00.000Z",
      }),
    ).toBe("verified");
  });

  // The important one. store-api DOES serialise `emailVerifiedAt` now, but the
  // distinction this guards is not obsolete: an absent field must never be read
  // as "unverified", or a cached older response — or any future endpoint that
  // trims the field — would show a false "confirm your address" warning to every
  // user, including ones verified long ago.
  //
  // The field is deleted explicitly rather than omitted from the factory: the
  // factory has to satisfy UserEntity, where the field is required, so "absent"
  // is only expressible here.
  it("reports 'unknown' — never 'unverified' — when the field is absent", () => {
    const profile = makeProfile();
    delete (profile as { emailVerifiedAt?: unknown }).emailVerifiedAt;

    expect(readEmailVerificationState(profile)).toBe("unknown");
  });
});
