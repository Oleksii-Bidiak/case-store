import type { UserEntity } from "@/shared/api/generated/models";
import { readEmailVerificationState } from "./email-verification";

/** A profile as `GET /api/users/me` returns it today — no `emailVerifiedAt`. */
function makeProfile(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: "user-1",
    email: "oleg@example.com",
    firstName: "Олег",
    lastName: "Коваль",
    phone: "+380501234567",
    role: "CUSTOMER",
    isActive: true,
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

  // The important one. store-api does not serialise `emailVerifiedAt` on the
  // profile yet; treating "absent" as "unverified" would show a false
  // "confirm your address" warning to every user, verified or not.
  it("reports 'unknown' — never 'unverified' — when the field is absent", () => {
    expect(readEmailVerificationState(makeProfile())).toBe("unknown");
  });
});
