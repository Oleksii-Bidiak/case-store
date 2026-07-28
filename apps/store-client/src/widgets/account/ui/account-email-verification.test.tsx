import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeUser } from "@/shared/test/msw-handlers";
import type { UserEntity } from "@/entities/user";
import { dict } from "@/shared/config";
import { AccountEmailVerification } from "./account-email-verification";

const d = dict.auth.verifyEmail;

/**
 * A profile carrying `emailVerifiedAt`. The generated `UserEntity` has no such
 * property yet (store-api does not serialise it), so the intersection mirrors
 * what `readEmailVerificationState` reads.
 */
function userWithVerification(
  emailVerifiedAt: string | null,
): UserEntity & { emailVerifiedAt: string | null } {
  return { ...makeUser().data, emailVerifiedAt };
}

describe("AccountEmailVerification", () => {
  it("says the address is unverified and offers to resend the letter", () => {
    renderWithProviders(
      <AccountEmailVerification user={userWithVerification(null)} />,
      { auth: { isAuthenticated: true } },
    );

    expect(screen.getByText(d.bannerUnverifiedTitle)).toBeInTheDocument();
    expect(screen.getByText(d.bannerUnverifiedBody)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.resend })).toBeInTheDocument();
  });

  it("requests a fresh link and confirms it was sent", async () => {
    let called = 0;
    server.use(
      http.post("*/api/auth/email/verify/request", () => {
        called += 1;
        return HttpResponse.json({ data: { message: "ok" } });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <AccountEmailVerification user={userWithVerification(null)} />,
      { auth: { isAuthenticated: true } },
    );

    await user.click(screen.getByRole("button", { name: d.resend }));

    expect(await screen.findByText(d.resendSuccess)).toBeInTheDocument();
    expect(called).toBe(1);
  });

  it("surfaces a failure to send rather than silently doing nothing", async () => {
    server.use(
      http.post("*/api/auth/email/verify/request", () =>
        HttpResponse.json({ statusCode: 429 }, { status: 429 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <AccountEmailVerification user={userWithVerification(null)} />,
      { auth: { isAuthenticated: true } },
    );

    await user.click(screen.getByRole("button", { name: d.resend }));

    expect(await screen.findByText(d.resendError)).toBeInTheDocument();
  });

  it("shows a confirmed state, with no resend button, once verified", () => {
    renderWithProviders(
      <AccountEmailVerification
        user={userWithVerification("2026-07-01T10:00:00.000Z")}
      />,
      { auth: { isAuthenticated: true } },
    );

    expect(screen.getByText(d.bannerVerified)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.resend }),
    ).not.toBeInTheDocument();
  });

  // The profile endpoint reports `emailVerifiedAt` now, but a response that
  // omits it — an older cached one, or a future endpoint that trims the field —
  // must still render nothing. Reading "absent" as "unverified" would show the
  // banner to every user, including those who verified long ago.
  //
  // The field is deleted explicitly: `makeUser` has to satisfy UserEntity, where
  // it is required, so "absent" is only expressible here.
  it("renders nothing when the profile does not report verification state", () => {
    const user = makeUser().data;
    delete (user as { emailVerifiedAt?: unknown }).emailVerifiedAt;

    const { container } = renderWithProviders(
      <AccountEmailVerification user={user} />,
      { auth: { isAuthenticated: true } },
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(d.bannerUnverifiedTitle)).not.toBeInTheDocument();
  });
});
