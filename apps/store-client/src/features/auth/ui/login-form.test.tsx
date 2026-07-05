import { http, HttpResponse } from "msw";
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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: () => null }),
}));

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
    expect(
      screen.queryByText(dict.auth.login.errorDeactivated),
    ).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the deactivated-account message when the 401 says so (TASK-202)", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        unauthorized("Account is deactivated"),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await submitCredentials(user);

    expect(
      await screen.findByText(dict.auth.login.errorDeactivated),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.auth.login.errorInvalid),
    ).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("matches the deactivated message case-insensitively (defensive)", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        unauthorized("ACCOUNT IS DEACTIVATED"),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await submitCredentials(user);

    expect(
      await screen.findByText(dict.auth.login.errorDeactivated),
    ).toBeInTheDocument();
  });
});
