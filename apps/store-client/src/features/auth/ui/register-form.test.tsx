import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { RegisterForm } from "./register-form";

// next/navigation is unavailable under jsdom — mock the router and search params.
// Names are `mock`-prefixed so jest allows them inside the hoisted factory.
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRedirectParam: string | null = null;
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "redirect" ? mockRedirectParam : null),
  }),
}));

/** Fill the register form with valid values so zod validation passes. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(dict.auth.register.email),
    "new@user.ua",
  );
  await user.type(screen.getByLabelText(dict.auth.register.firstName), "Олег");
  await user.type(screen.getByLabelText(dict.auth.register.lastName), "Коваль");
  // Must satisfy the TASK-227 password policy (min 8 + lower + upper + digit).
  await user.type(
    screen.getByLabelText(dict.auth.register.password),
    "Password123",
  );
  await user.type(
    screen.getByLabelText(dict.auth.register.confirmPassword),
    "Password123",
  );
  // Terms consent is required before the form will submit.
  await user.click(screen.getByRole("checkbox"));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRedirectParam = null;
  });

  it("redirects to '/' after a successful registration", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("honours a same-origin ?redirect= target on success", async () => {
    mockRedirectParam = "/checkout";
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/checkout"));
  });

  it("ignores an absolute-URL ?redirect= (open-redirect guard) and falls back to '/'", async () => {
    mockRedirectParam = "https://evil.com";
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockPush).not.toHaveBeenCalledWith("https://evil.com");
  });

  it("redirects away when already authenticated on mount", async () => {
    renderWithProviders(<RegisterForm />, {
      auth: { isAuthenticated: true, accessToken: "token" },
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });

  it("rejects a weak password (TASK-227 policy) without calling the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(
      screen.getByLabelText(dict.auth.register.email),
      "new@user.ua",
    );
    await user.type(
      screen.getByLabelText(dict.auth.register.firstName),
      "Олег",
    );
    await user.type(
      screen.getByLabelText(dict.auth.register.lastName),
      "Коваль",
    );
    // The QA sample: 8 chars but no uppercase letter and no digit.
    await user.type(
      screen.getByLabelText(dict.auth.register.password),
      "testtest",
    );
    await user.type(
      screen.getByLabelText(dict.auth.register.confirmPassword),
      "testtest",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    expect(
      await screen.findByText(dict.auth.register.validationPasswordPolicy),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the conflict message when the email is already registered (409)", async () => {
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json({ message: "Conflict" }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    expect(
      await screen.findByText(dict.auth.register.errorConflict),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the generic error message on a server failure (500)", async () => {
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json({ message: "Boom" }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    expect(
      await screen.findByText(dict.common.genericError),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
