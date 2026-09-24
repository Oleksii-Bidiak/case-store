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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "redirect" ? mockRedirectParam : null),
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
  });
});
