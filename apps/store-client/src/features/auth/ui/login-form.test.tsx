import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { LoginForm } from "./login-form";

// next/navigation is unavailable under jsdom — mock the router and search params.
// Names are `mock`-prefixed so jest allows them inside the hoisted factory.
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams[key] ?? null,
  }),
}));

// The Apple button is still an honest stub (TASK-168 shipped Google only) —
// its toast is the one sonner call left in this component.
jest.mock("sonner", () => ({ toast: jest.fn() }));

/** Build the API error envelope the backend emits for a 401. */
function unauthorized(message: string) {
  return HttpResponse.json(
    {
      statusCode: 401,
      error: "UnauthorizedException",
      message,
      timestamp: "2026-07-05T00:00:00.000Z",
      path: "/api/auth/login",
    },
    { status: 401 },
  );
}

/** Fill the login form with syntactically valid credentials and submit. */
async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(dict.auth.login.email), "user@test.ua");
  await user.type(
    screen.getByLabelText(dict.auth.login.password),
    "Password123",
  );
  await user.click(
    screen.getByRole("button", { name: dict.auth.login.submit }),
  );
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    (toast as unknown as jest.Mock).mockClear();
    mockSearchParams = {};
  });

  it("redirects to '/' after a successful sign-in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await submitCredentials(user);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("shows the invalid-credentials message on a plain 401", async () => {
    server.use(
      http.post("*/api/auth/login", () => unauthorized("Invalid credentials")),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await submitCredentials(user);

    expect(
      await screen.findByText(dict.auth.login.errorInvalid),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // TASK-402: a 429 is the throttler talking, not the credentials. Reading it as
  // "щось пішло не так" invites the shopper to keep hammering an endpoint that
  // is already refusing them.
  it("names the rate limit on a 429, without mentioning the account lockout", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json(
          { statusCode: 429, message: "ThrottlerException: Too Many Requests" },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await submitCredentials(user);

    expect(
      await screen.findByText(dict.auth.login.errorTooMany),
    ).toBeInTheDocument();
    // Anti-enumeration: the separate 15-minute per-account lockout must stay
    // invisible, so the copy may name only the IP throttle's one-minute window.
    expect(dict.auth.login.errorTooMany).not.toMatch(/15/);
    expect(screen.queryByText(dict.common.genericError)).toBeNull();
  });

  // TASK-287: the API now answers EVERY login failure — including a deactivated
  // account — with the same generic 401, so there is no deactivated-specific UI
  // left to test. The permanent support link is what a locked-out user gets.
  it("always offers a keyboard-reachable support link to the contact page", () => {
    renderWithProviders(<LoginForm />);

    const supportLink = screen.getByRole("link", {
      name: dict.auth.support.contactLink,
    });

    expect(supportLink).toHaveAttribute("href", "/contact");
  });

  // ─── Google OAuth sign-in (TASK-168) ───────────────────────────────────────

  describe("Google OAuth (TASK-168)", () => {
    const realLocation = window.location;
    const realFlag = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;

    beforeEach(() => {
      // TASK-402: the button is opt-in per deployment now. These cases describe
      // a deployment that really has Google credentials.
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = "true";
      // jsdom cannot navigate — swap window.location for a writable stand-in
      // so the component's `window.location.href = ...` is observable.
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...realLocation, href: "http://localhost/" },
      });
    });

    afterEach(() => {
      // Assigning `undefined` would leave the literal string "undefined" behind.
      if (realFlag === undefined) {
        delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = realFlag;
      }
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: realLocation,
      });
    });

    it("navigates the top-level page to the backend Google OAuth route", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LoginForm />);

      await user.click(
        screen.getByRole("button", { name: dict.auth.login.google }),
      );

      // Same-origin default target when no ?redirect= is present.
      expect(window.location.href).toBe(
        "http://localhost:3001/api/auth/google?redirect=%2F",
      );
      // A navigation, not a toast — the stub is gone for Google.
      expect(toast).not.toHaveBeenCalled();
    });

    it("carries the same sanitized ?redirect= target the password login uses", async () => {
      mockSearchParams = { redirect: "/checkout" };
      const user = userEvent.setup();
      renderWithProviders(<LoginForm />);

      await user.click(
        screen.getByRole("button", { name: dict.auth.login.google }),
      );

      expect(window.location.href).toBe(
        "http://localhost:3001/api/auth/google?redirect=%2Fcheckout",
      );
    });

    it("keeps the Apple button as the honest coming-soon stub (owner decision)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LoginForm />);

      await user.click(
        screen.getByRole("button", { name: dict.auth.login.apple }),
      );

      expect(toast).toHaveBeenCalledWith(dict.auth.login.socialSoon);
      // No navigation happened.
      expect(window.location.href).toBe("http://localhost/");
    });

    it("shows a generic error banner when redirected back with ?oauthError=", async () => {
      mockSearchParams = { oauthError: "1" };
      renderWithProviders(<LoginForm />);

      const banner = await screen.findByText(dict.auth.oauth.error);
      expect(banner).toHaveAttribute("role", "alert");
    });
  });

  // ─── Google button is opt-in per deployment (TASK-402) ─────────────────────
  // `GET /api/auth/google` 500s unless the API carries real Google credentials.
  // On the demo stand it did not, so the most prominent control on the login
  // screen led to an error page. Absent configuration now means "no button".

  describe("Google button visibility (TASK-402)", () => {
    const realFlag = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;

    afterEach(() => {
      if (realFlag === undefined) {
        delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = realFlag;
      }
    });

    it("hides the Google button when the flag is unset", () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
      renderWithProviders(<LoginForm />);

      expect(
        screen.queryByRole("button", { name: dict.auth.login.google }),
      ).toBeNull();
      // The rest of the sign-in options are untouched.
      expect(
        screen.getByRole("button", { name: dict.auth.login.apple }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: dict.auth.login.submit }),
      ).toBeInTheDocument();
    });

    it("hides it for any value other than an explicit 'true'", () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = "";
      renderWithProviders(<LoginForm />);

      expect(
        screen.queryByRole("button", { name: dict.auth.login.google }),
      ).toBeNull();
    });

    it("shows it on a deployment that declares Google is configured", () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = "true";
      renderWithProviders(<LoginForm />);

      expect(
        screen.getByRole("button", { name: dict.auth.login.google }),
      ).toBeInTheDocument();
    });
  });
});
