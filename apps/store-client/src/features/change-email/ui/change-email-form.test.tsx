import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ChangeEmailForm } from "./change-email-form";

const d = dict.auth.changeEmail;
const CURRENT = "old@example.com";

/**
 * TASK-396. The form must never look like it changed the address: the API
 * only mails a link, and the login moves when the NEW inbox clicks it.
 */
describe("ChangeEmailForm (TASK-396)", () => {
  function captureRequests(response: () => Response) {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/auth/email-change/request", async ({ request }) => {
        bodies.push(await request.json());
        return response();
      }),
    );
    return bodies;
  }

  async function fillAndSubmit(newEmail: string, password: string) {
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText(d.newEmail), {
      target: { value: newEmail },
    });
    fireEvent.change(screen.getByLabelText(d.currentPassword), {
      target: { value: password },
    });
    await user.click(screen.getByRole("button", { name: d.submit }));
  }

  it("sends the normalised address with the password and says to check the NEW inbox", async () => {
    const bodies = captureRequests(() =>
      HttpResponse.json({ data: { message: "sent" } }),
    );
    renderWithProviders(<ChangeEmailForm currentEmail={CURRENT} />);

    await fillAndSubmit("  New@Example.com ", "secret-pass");

    expect(await screen.findByText(d.sentHeading)).toBeInTheDocument();
    expect(screen.getByText(d.sentBody("new@example.com"))).toBeInTheDocument();
    expect(bodies).toEqual([
      { newEmail: "new@example.com", currentPassword: "secret-pass" },
    ]);
  });

  it("refuses the current address before any request", async () => {
    const bodies = captureRequests(() =>
      HttpResponse.json({ data: { message: "sent" } }),
    );
    renderWithProviders(<ChangeEmailForm currentEmail={CURRENT} />);

    await fillAndSubmit("OLD@example.com", "secret-pass");

    expect(await screen.findByText(d.validationSame)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("requires the current password", async () => {
    const bodies = captureRequests(() =>
      HttpResponse.json({ data: { message: "sent" } }),
    );
    renderWithProviders(<ChangeEmailForm currentEmail={CURRENT} />);

    await fillAndSubmit("new@example.com", "");

    expect(await screen.findByText(d.validationPassword)).toBeInTheDocument();
    expect(screen.getByLabelText(d.currentPassword)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toHaveLength(0);
  });

  it("names a wrong password on 401 instead of a generic error", async () => {
    captureRequests(() =>
      HttpResponse.json(
        {
          statusCode: 401,
          error: "UnauthorizedException",
          message: "Invalid credentials",
        },
        { status: 401 },
      ),
    );
    renderWithProviders(<ChangeEmailForm currentEmail={CURRENT} />);

    await fillAndSubmit("new@example.com", "wrong");

    expect(await screen.findByText(d.errorWrongPassword)).toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });

  it("says the address is taken on 409", async () => {
    captureRequests(() =>
      HttpResponse.json(
        { statusCode: 409, error: "ConflictException", message: "taken" },
        { status: 409 },
      ),
    );
    renderWithProviders(<ChangeEmailForm currentEmail={CURRENT} />);

    await fillAndSubmit("taken@example.com", "secret-pass");

    expect(await screen.findByText(d.errorTaken)).toBeInTheDocument();
  });
});
