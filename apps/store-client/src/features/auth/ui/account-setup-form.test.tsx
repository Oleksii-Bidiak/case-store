import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AccountSetupForm } from "./account-setup-form";

// `mockToken` is mutable so each test controls the `?token=` value.
let mockToken: string | null = "setup-token-1";
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? mockToken : null),
  }),
}));

const d = dict.auth.accountSetup;

function captureConfirm(
  respond: () => Response = () =>
    HttpResponse.json({
      data: { accessToken: "setup.session.token", claimedOrders: 0 },
    }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/auth/account-setup/confirm", async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

/**
 * TASK-2010 — `/account-setup?token=…`, the «Задайте пароль» letter of an
 * account created at checkout. Both buttons prove the address and sign in;
 * only one sets a password.
 */
describe("AccountSetupForm (TASK-2010)", () => {
  beforeEach(() => {
    mockToken = "setup-token-1";
    mockReplace.mockClear();
  });

  it("sets the password, signs in and opens the cabinet", async () => {
    const bodies = captureConfirm();
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AccountSetupForm />, { auth: { setTokens } });

    await user.type(screen.getByLabelText(d.password), "secret123");
    await user.type(screen.getByLabelText(d.confirmPassword), "secret123");
    await user.click(screen.getByRole("button", { name: d.submit }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account"));
    expect(bodies).toEqual([{ token: "setup-token-1", password: "secret123" }]);
    expect(setTokens).toHaveBeenCalledWith("setup.session.token");
  });

  it("«Пропустити» confirms without a password — and carries the claimed orders", async () => {
    const bodies = captureConfirm(() =>
      HttpResponse.json({
        data: { accessToken: "setup.session.token", claimedOrders: 3 },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountSetupForm />);

    await user.click(screen.getByRole("button", { name: d.skip }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/account?claimed=3"),
    );
    expect(bodies).toEqual([{ token: "setup-token-1" }]);
  });

  it("holds the password to the registration policy before asking the server", async () => {
    const bodies = captureConfirm();
    const user = userEvent.setup();
    renderWithProviders(<AccountSetupForm />);

    await user.type(screen.getByLabelText(d.password), "PASSWORD");
    await user.type(screen.getByLabelText(d.confirmPassword), "PASSWORD");
    await user.click(screen.getByRole("button", { name: d.submit }));

    expect(
      await screen.findByText(dict.auth.register.validationPasswordPolicy),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("says when the two passwords differ", async () => {
    captureConfirm();
    const user = userEvent.setup();
    renderWithProviders(<AccountSetupForm />);

    await user.type(screen.getByLabelText(d.password), "secret123");
    await user.type(screen.getByLabelText(d.confirmPassword), "secret124");
    await user.click(screen.getByRole("button", { name: d.submit }));

    expect(
      await screen.findByText(dict.auth.register.validationPasswordMatch),
    ).toBeInTheDocument();
  });

  it("a dead link (ACCOUNT_SETUP_INVALID) points at /forgot-password", async () => {
    captureConfirm(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "ACCOUNT_SETUP_INVALID",
          message: "Invalid or expired link",
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountSetupForm />);

    await user.click(screen.getByRole("button", { name: d.skip }));

    expect(await screen.findByRole("alert")).toHaveTextContent(d.errorInvalid);
    expect(
      screen.getByRole("link", { name: d.toForgotPassword }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("asks nothing of the server when the link has no token", () => {
    mockToken = null;
    const bodies = captureConfirm();
    renderWithProviders(<AccountSetupForm />);

    expect(screen.getByRole("alert")).toHaveTextContent(d.errorMissingToken);
    expect(screen.queryByRole("button", { name: d.skip })).toBeNull();
    expect(bodies).toHaveLength(0);
  });
});
