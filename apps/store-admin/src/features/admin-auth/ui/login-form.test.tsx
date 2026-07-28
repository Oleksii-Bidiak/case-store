import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: () => null }),
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
  isInitializing: false,
  permissions: [],
  arePermissionsLoading: false,
  can: () => false,
  canAll: () => false,
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
};

function renderLoginForm() {
  return renderWithProviders(
    <AuthContext.Provider value={guestAuth}>
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
});
