import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ChangeUserEmailDialog } from "./ChangeUserEmailDialog";

const d = dict.users;

/**
 * TASK-396 — the owner changes a customer's sign-in address on their behalf.
 * The reason is required (it is the audit trail), the new address is validated
 * before any request, and a server refusal is shown in the server's words.
 */
describe("ChangeUserEmailDialog (TASK-396)", () => {
  function stub(status = 200) {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/users/:id/email", async ({ request, params }) => {
        bodies.push({ id: params.id, body: await request.json() });
        if (status !== 200) {
          return HttpResponse.json(
            {
              statusCode: status,
              error: "ConflictException",
              message:
                "This email address is already registered to another account",
            },
            { status },
          );
        }
        return HttpResponse.json({
          data: {
            id: "customer-1",
            email: "found@example.com",
            firstName: null,
            lastName: null,
            phone: null,
            role: "CUSTOMER",
            isActive: true,
            emailVerifiedAt: null,
            lockedUntil: null,
            failedLoginAttempts: 0,
            createdAt: "2026-06-01T10:00:00.000Z",
            updatedAt: "2026-06-01T10:00:00.000Z",
          },
        });
      }),
    );
    return bodies;
  }

  function render(onOpenChange = jest.fn()) {
    renderWithProviders(
      <ChangeUserEmailDialog
        userId="customer-1"
        email="lost@example.com"
        open
        onOpenChange={onOpenChange}
      />,
    );
    return onOpenChange;
  }

  async function fill(newEmail: string, reason: string) {
    fireEvent.change(screen.getByLabelText(d.changeEmailNew), {
      target: { value: newEmail },
    });
    fireEvent.change(screen.getByLabelText(d.changeEmailReason), {
      target: { value: reason },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: d.changeEmailSubmit }));
  }

  it("says the new address will NOT be confirmed by this", () => {
    render();

    expect(
      screen.getByText(d.changeEmailDescription("lost@example.com")),
    ).toBeInTheDocument();
  });

  it("refuses to send without a reason", async () => {
    const bodies = stub();
    render();

    await fill("found@example.com", "");

    expect(
      await screen.findByText(d.changeEmailReasonRequired),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(d.changeEmailReason)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toHaveLength(0);
  });

  it("refuses the customer's current address", async () => {
    const bodies = stub();
    render();

    await fill("LOST@example.com", "Клієнт телефонував");

    expect(await screen.findByText(d.changeEmailSame)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("sends the normalised address with the reason and closes on success", async () => {
    const bodies = stub();
    const onOpenChange = render();

    await fill(
      "  Found@Example.com ",
      "  Клієнт телефонував, звірили номер замовлення ",
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(bodies).toEqual([
      {
        id: "customer-1",
        body: {
          newEmail: "found@example.com",
          reason: "Клієнт телефонував, звірили номер замовлення",
        },
      },
    ]);
  });

  it("shows the server's refusal verbatim (409 — address taken)", async () => {
    stub(409);
    render();

    await fill("taken@example.com", "Клієнт телефонував");

    expect(
      await screen.findAllByText(
        "This email address is already registered to another account",
      ),
    ).not.toHaveLength(0);
  });
});
