import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  it("shows the generic success copy after a successful request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "user@test.ua",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.forgotPassword.success),
    ).toBeInTheDocument();
  });

  it("shows the SAME generic success even when the API reports the email is unknown (no branching)", async () => {
    // The real backend returns the same 200 for a non-existent email; the UI
    // must not undermine existence-hiding by reacting differently.
    server.use(
      http.post("*/api/auth/password-reset/request", () =>
        HttpResponse.json({ data: { message: "whatever" } }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "ghost@test.ua",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.forgotPassword.success),
    ).toBeInTheDocument();
  });

  it("blocks an invalid email with an inline validation error and fires no request", async () => {
    let requestFired = false;
    server.use(
      http.post("*/api/auth/password-reset/request", () => {
        requestFired = true;
        return HttpResponse.json({ data: { message: "ok" } });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "not-an-email",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.forgotPassword.validationEmail),
    ).toBeInTheDocument();
    // Never reaches the success state, and no network call was made.
    expect(
      screen.queryByText(dict.auth.forgotPassword.success),
    ).not.toBeInTheDocument();
    expect(requestFired).toBe(false);
  });

  // TASK-871: failures used to vanish, leaving a button that did nothing.
  it("shows a network error and stays on the form when the request fails", async () => {
    server.use(
      http.post("*/api/auth/password-reset/request", () =>
        HttpResponse.json({ statusCode: 503 }, { status: 503 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "user@test.ua",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.auth.forgotPassword.errorNetwork,
    );
    expect(
      screen.queryByText(dict.auth.forgotPassword.success),
    ).not.toBeInTheDocument();
    // The form is still there to retry.
    expect(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    ).toBeEnabled();
  });

  it("names the throttle on a 429 instead of a network error", async () => {
    server.use(
      http.post("*/api/auth/password-reset/request", () =>
        HttpResponse.json({ statusCode: 429 }, { status: 429 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "user@test.ua",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.forgotPassword.errorTooMany),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.auth.forgotPassword.errorNetwork),
    ).not.toBeInTheDocument();
  });

  // TASK-1984: a 400 is the address the API refused, not the connection. Still
  // one banner, not a field (forms Rule 6d).
  it("names the address, not the network, on a 400", async () => {
    server.use(
      http.post("*/api/auth/password-reset/request", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: ["Please provide a valid email address"],
            fieldErrors: [{ field: "email", constraint: "isEmail" }],
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.forgotPassword.email),
      "user@test.ua",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.auth.forgotPassword.validationEmail,
    );
    expect(
      screen.queryByText(dict.auth.forgotPassword.errorNetwork),
    ).not.toBeInTheDocument();
  });

  it("trims the address and caps it at the DTO's 254 characters", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/auth/password-reset/request", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { message: "ok" } });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    const input = screen.getByLabelText(dict.auth.forgotPassword.email);
    expect(input).toHaveAttribute("maxLength", "254");
    await user.type(input, "  user@test.ua ");
    await user.click(
      screen.getByRole("button", { name: dict.auth.forgotPassword.submit }),
    );

    await waitFor(() => expect(bodies).toEqual([{ email: "user@test.ua" }]));
  });

  it("switches back to login via the callback in sheet mode", async () => {
    const onSwitchToLogin = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ForgotPasswordForm onSwitchToLogin={onSwitchToLogin} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: dict.auth.forgotPassword.backToLogin,
      }),
    );

    await waitFor(() => expect(onSwitchToLogin).toHaveBeenCalled());
  });
});
