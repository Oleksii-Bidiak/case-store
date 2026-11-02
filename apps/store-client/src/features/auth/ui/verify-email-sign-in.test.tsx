import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { VerifyEmailConfirm } from "./verify-email-confirm";

const TOKEN = "verify-token-1";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? "verify-token-1" : null),
  }),
}));

const s = dict.auth.verifySignIn;

function signInRequired() {
  return HttpResponse.json(
    {
      statusCode: 403,
      error: "VERIFY_SIGN_IN_REQUIRED",
      message: "Sign in to confirm this address",
    },
    { status: 403 },
  );
}

/**
 * TASK-2010 / TASK-2362 — confirming an address takes it over from anyone who
 * opened an account on it uninvited, so the server checks who clicked: a
 * password-less account gets a fresh session, a password account only its
 * signed-in owner (403 VERIFY_SIGN_IN_REQUIRED, the link not spent).
 */
describe("VerifyEmailConfirm — who may confirm (TASK-2010)", () => {
  it("waits for the session restore before spending the link", async () => {
    const calls: unknown[] = [];
    server.use(
      http.post("*/api/auth/email/verify/confirm", async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({
          data: { message: "ok", claimedOrders: 0 },
        });
      }),
    );

    // Sent before the restore, the owner's own click would come back 403.
    renderWithProviders(<VerifyEmailConfirm />, {
      auth: { isInitializing: true },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(0);
    expect(
      screen.getByText(dict.auth.verifyEmail.checking),
    ).toBeInTheDocument();
  });

  it("stores the fresh session a password-less account gets back", async () => {
    server.use(
      http.post("*/api/auth/email/verify/confirm", () =>
        HttpResponse.json({
          data: {
            message: "ok",
            claimedOrders: 1,
            session: { accessToken: "fresh.session.token" },
          },
        }),
      ),
    );
    const setTokens = jest.fn();
    renderWithProviders(<VerifyEmailConfirm />, { auth: { setTokens } });

    expect(
      await screen.findByText(dict.auth.verifyEmail.successHeading),
    ).toBeInTheDocument();
    expect(setTokens).toHaveBeenCalledWith("fresh.session.token");
  });

  it("asks a password account's owner to sign in, then confirms the same link", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/auth/email/verify/confirm", async ({ request }) => {
        bodies.push(await request.json());
        return bodies.length === 1
          ? signInRequired()
          : HttpResponse.json({ data: { message: "ok", claimedOrders: 2 } });
      }),
    );
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<VerifyEmailConfirm />, { auth: { setTokens } });

    expect(
      await screen.findByRole("heading", { name: s.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: s.forgotLink })).toHaveAttribute(
      "href",
      "/forgot-password",
    );

    await user.type(
      screen.getByLabelText(dict.auth.login.email),
      "owner@example.com",
    );
    await user.type(
      screen.getByLabelText(dict.auth.login.password),
      "secret123",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.login.submit }),
    );

    expect(
      await screen.findByText(dict.auth.verifyEmail.successHeading),
    ).toBeInTheDocument();
    expect(setTokens).toHaveBeenCalledWith("test.access.token");
    expect(bodies).toEqual([{ token: TOKEN }, { token: TOKEN }]);
    expect(
      screen.getByRole("link", { name: dict.auth.verifyEmail.toAccount }),
    ).toHaveAttribute("href", "/account?claimed=2");
  });

  it("never treats the sign-in refusal as a dead link", async () => {
    server.use(
      http.post("*/api/auth/email/verify/confirm", () => signInRequired()),
    );
    renderWithProviders(<VerifyEmailConfirm />);

    await screen.findByRole("heading", { name: s.heading });
    await waitFor(() =>
      expect(
        screen.queryByText(dict.auth.verifyEmail.errorBody),
      ).not.toBeInTheDocument(),
    );
  });
});
