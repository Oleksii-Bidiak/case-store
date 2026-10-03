import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  AuthContext,
  type AuthContextValue,
} from "@/entities/session/model/auth.context";
import { AdminLoginForm } from "./login-form";

// next/navigation is unavailable under jsdom — mock the router and search params.
const mockPush = jest.fn();
const mockReplace = jest.fn();
// The raw `?redirect=` value as `useSearchParams().get()` hands it over, i.e.
// already percent-decoded. `null` = no param.
let mockRedirectParam: string | null = null;
// Wave 198: `?next=` (TASK-974) and `?reason=session` (TASK-1036) too.
let mockOtherParams: Record<string, string> = {};
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) =>
      key === "redirect" ? mockRedirectParam : (mockOtherParams[key] ?? null),
  }),
}));

/** A signed-out, initialized admin session context. */
const guestAuth: AuthContextValue = {
  accessToken: null,
  userId: null,
  role: null,
  email: null,
  isAuthenticated: false,
  isStaff: false,
  isOwner: false,
  isAdmin: false,
  isInitializing: false,
  permissions: [],
  arePermissionsLoading: false,
  permissionsFailed: false,
  isRetryingPermissions: false,
  retryPermissions: jest.fn(),
  isSessionExpired: false,
  expiredSessionEmail: null,
  can: () => false,
  canAll: () => false,
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
};

function renderLoginForm(auth: AuthContextValue = guestAuth) {
  return renderWithProviders(
    <AuthContext.Provider value={auth}>
      <AdminLoginForm />
    </AuthContext.Provider>,
  );
}

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
  await user.type(screen.getByLabelText(dict.login.email), "admin@test.ua");
  await user.type(screen.getByLabelText(dict.login.password), "Password123");
  await user.click(screen.getByRole("button", { name: dict.login.signIn }));
}

describe("AdminLoginForm", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRedirectParam = null;
    mockOtherParams = {};
  });

  it("shows the invalid-credentials message on a plain 401", async () => {
    server.use(
      http.post("*/api/auth/login", () => unauthorized("Invalid credentials")),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await submitCredentials(user);

    expect(
      await screen.findByText(dict.login.errorInvalid),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // TASK-287: the API now answers EVERY login failure — including a deactivated
  // account — with the same generic 401, so there is no deactivated-specific UI
  // left to test. The permanent support link is what a locked-out admin gets.
  it("always offers a keyboard-reachable support link to the storefront contact page", () => {
    renderLoginForm();

    const supportLink = screen.getByRole("link", {
      name: dict.authSupport.contactLink,
    });

    expect(supportLink).toHaveAttribute(
      "href",
      expect.stringContaining("/contact"),
    );
  });

  /**
   * TASK-527: the form used to accept any `?redirect=` starting with `/`, so a
   * protocol-relative target (or one with a TAB hidden between the slashes,
   * which the URL parser drops — TASK-770) sent a freshly signed-in admin to
   * another origin. Values are what `searchParams.get()` returns: decoded.
   */
  describe("?redirect= target", () => {
    /** An access token whose payload carries an ADMIN role claim. */
    const adminToken = `h.${btoa(JSON.stringify({ role: "ADMIN" }))}.s`;

    function answerLoginWithAdminToken() {
      server.use(
        http.post("*/api/auth/login", () =>
          HttpResponse.json({ data: { accessToken: adminToken } }),
        ),
      );
    }

    it.each([
      ["/%09/evil.com (decoded TAB between the slashes)", "/\t/evil.com"],
      ["//evil.com (protocol-relative)", "//evil.com"],
    ])(
      "lands on the dashboard after login for %s",
      async (_label, redirect) => {
        mockRedirectParam = redirect;
        answerLoginWithAdminToken();

        const user = userEvent.setup();
        renderLoginForm();
        await submitCredentials(user);

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
        expect(mockPush).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ["/%09/evil.com", "/\t/evil.com"],
      ["//evil.com", "//evil.com"],
    ])(
      "sends an already signed-in admin to the dashboard for %s",
      (_label, redirect) => {
        mockRedirectParam = redirect;
        renderLoginForm({ ...guestAuth, isAuthenticated: true, isStaff: true });

        expect(mockReplace).toHaveBeenCalledWith("/");
        expect(mockReplace).not.toHaveBeenCalledWith(redirect);
      },
    );

    // Guards against the fix "passing" by ignoring the param altogether.
    it("still honours a plain same-origin path", async () => {
      mockRedirectParam = "/orders?status=NEW";
      answerLoginWithAdminToken();

      const user = userEvent.setup();
      renderLoginForm();
      await submitCredentials(user);

      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith("/orders?status=NEW"),
      );
    });

    // TASK-974: `proxy.ts` and «Сесія закінчилась» send `?next=`.
    it("returns to ?next= after login", async () => {
      mockOtherParams = { next: "/returns?status=REQUESTED" };
      answerLoginWithAdminToken();

      const user = userEvent.setup();
      renderLoginForm();
      await submitCredentials(user);

      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith("/returns?status=REQUESTED"),
      );
    });

    it("sanitizes ?next= like ?redirect=", async () => {
      mockOtherParams = { next: "//evil.com" };
      answerLoginWithAdminToken();

      const user = userEvent.setup();
      renderLoginForm();
      await submitCredentials(user);

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    });
  });

  /** Wave 198 — the Login artboard П1–П4 (TASK-1036). */
  describe("form canon (TASK-1036)", () => {
    it("marks both empty fields invalid with the reason under each", async () => {
      const user = userEvent.setup();
      renderLoginForm();

      await user.click(screen.getByRole("button", { name: dict.login.signIn }));

      const email = screen.getByLabelText(dict.login.email);
      const password = screen.getByLabelText(dict.login.password);
      await waitFor(() =>
        expect(email).toHaveAttribute("aria-invalid", "true"),
      );
      expect(password).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveAccessibleDescription(dict.login.emailInvalid);
      expect(password).toHaveAccessibleDescription(dict.login.passwordRequired);
    });

    it("leaves a valid field un-flagged", async () => {
      const user = userEvent.setup();
      renderLoginForm();

      await user.type(screen.getByLabelText(dict.login.email), "a@b.ua");
      await user.click(screen.getByRole("button", { name: dict.login.signIn }));

      await waitFor(() =>
        expect(screen.getByLabelText(dict.login.password)).toHaveAttribute(
          "aria-invalid",
          "true",
        ),
      );
      expect(screen.getByLabelText(dict.login.email)).not.toHaveAttribute(
        "aria-invalid",
      );
    });

    it("puts no asterisks on the labels — both fields are required", () => {
      renderLoginForm();

      expect(screen.queryByText("*")).not.toBeInTheDocument();
    });

    it("shows a server refusal as one alert block above the submit button", async () => {
      server.use(
        http.post("*/api/auth/login", () =>
          unauthorized("Invalid credentials"),
        ),
      );
      const user = userEvent.setup();
      renderLoginForm();

      await submitCredentials(user);

      const alert = await screen.findByText(dict.login.errorInvalid);
      const block = alert.closest('[data-slot="form-alert"]');
      expect(block).toHaveAttribute("role", "alert");
      const submit = screen.getByRole("button", { name: dict.login.signIn });
      expect(
        block!.compareDocumentPosition(submit) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("says why the person is here after «Сесія закінчилась»", () => {
      mockOtherParams = { reason: "session", next: "/orders" };
      renderLoginForm({ ...guestAuth, expiredSessionEmail: "op@store.ua" });

      expect(screen.getByRole("status")).toHaveTextContent(
        dict.login.sessionExpired,
      );
      expect(screen.getByLabelText(dict.login.email)).toHaveValue(
        "op@store.ua",
      );
    });

    it("shows no session note on an ordinary visit", () => {
      renderLoginForm();

      expect(
        screen.queryByText(dict.login.sessionExpired),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * TASK-1210: a submit before hydration is a NATIVE submit. Without a method
   * it is a GET, and the password lands in the address bar, the history, the
   * proxy logs and the Referer. POST keeps it in the body.
   */
  it("submits natively by POST, never by GET (TASK-1210)", () => {
    const { container } = renderLoginForm();

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form?.method).toBe("post");
  });
});
