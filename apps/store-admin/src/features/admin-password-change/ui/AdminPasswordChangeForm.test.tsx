import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminPasswordChangeForm } from "./AdminPasswordChangeForm";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const d = dict.profile;
const { toast } = jest.requireMock("@/shared/ui/toast") as {
  toast: { error: jest.Mock };
};

/**
 * Wave 198 (TASK-1055, Profile П3): show/hide on every field, the live rule
 * checklist under «Новий пароль», the mismatch under the confirm field — and
 * the same `POST /api/auth/password/change` underneath.
 */

// Labels carry a decorative « *»; anchor on the start so the toggle buttons
// («Показати пароль») never match.
const current = () => screen.getByLabelText(/^Поточний пароль/);
const next = () => screen.getByLabelText(/^Новий пароль/);
const confirm = () => screen.getByLabelText(/^Повторіть новий пароль/);

function captureChange() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/auth/password/change", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: { success: true } });
    }),
  );
  return bodies;
}

describe("AdminPasswordChangeForm", () => {
  it("marks all three fields required", () => {
    renderWithProviders(<AdminPasswordChangeForm />);

    for (const field of [current(), next(), confirm()]) {
      expect(field).toBeRequired();
    }
    expect(screen.getAllByText("*", { exact: false })).toHaveLength(3);
  });

  it("puts a show/hide toggle on every field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    const toggles = screen.getAllByRole("button", {
      name: dict.canon.showPassword,
    });
    expect(toggles).toHaveLength(3);
    expect(next()).toHaveAttribute("type", "password");

    await user.click(toggles[1]);

    expect(next()).toHaveAttribute("type", "text");
  });

  it("ticks the rules off live under «Новий пароль»", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    const rules = screen.getByRole("list", {
      name: dict.canon.passwordRequirementsLabel,
    });
    expect(within(rules).getAllByRole("listitem")).toHaveLength(4);
    expect(
      within(rules)
        .getAllByRole("listitem")
        .filter((item) => item.dataset.met === "true"),
    ).toHaveLength(0);

    await user.type(next(), "abcdefgh1");

    const met = within(rules)
      .getAllByRole("listitem")
      .filter((item) => item.dataset.met === "true")
      .map((item) => item.firstChild?.textContent);
    expect(met).toEqual([
      dict.canon.passwordMinLength(8),
      dict.canon.passwordLowercase,
      dict.canon.passwordDigit,
    ]);
  });

  it("says «Паролі не збігаються» under the confirm field, as it is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    await user.type(next(), "Password123");
    await user.type(confirm(), "Password12");

    expect(confirm()).toHaveAttribute("aria-invalid", "true");
    expect(confirm()).toHaveAccessibleDescription(d.passwordMismatch);

    await user.type(confirm(), "3");

    expect(confirm()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(d.passwordMismatch)).not.toBeInTheDocument();
  });

  it("puts a weak new password's reason under that field and sends nothing", async () => {
    const bodies = captureChange();
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    await user.type(current(), "Old-pass1");
    await user.type(next(), "short");
    await user.type(confirm(), "short");
    await user.click(screen.getByRole("button", { name: d.passwordSubmit }));

    expect(next()).toHaveAttribute("aria-invalid", "true");
    expect(next()).toHaveAccessibleDescription(d.passwordWeak);
    expect(bodies).toHaveLength(0);
  });

  it("asks for the current password under its own field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    await user.click(screen.getByRole("button", { name: d.passwordSubmit }));

    expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(current()).toHaveAccessibleDescription(d.passwordRequired);
  });

  it("still calls the same change-password endpoint and clears the form", async () => {
    const bodies = captureChange();
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    await user.type(current(), "Old-pass1");
    await user.type(next(), "Password123");
    await user.type(confirm(), "Password123");
    await user.click(screen.getByRole("button", { name: d.passwordSubmit }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { currentPassword: "Old-pass1", newPassword: "Password123" },
      ]),
    );
    await waitFor(() => expect(current()).toHaveValue(""));
  });

  it("puts a wrong current password under that field", async () => {
    server.use(
      http.post("*/api/auth/password/change", () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);

    await user.type(current(), "Wrong-pass1");
    await user.type(next(), "Password123");
    await user.type(confirm(), "Password123");
    await user.click(screen.getByRole("button", { name: d.passwordSubmit }));

    await waitFor(() =>
      expect(current()).toHaveAttribute("aria-invalid", "true"),
    );
    expect(current()).toHaveAccessibleDescription(d.passwordWrongCurrent);
    // TASK-1984 (Rule 6c): shown once — no toast repeating the field error.
    expect(toast.error).not.toHaveBeenCalled();
  });

  async function submitValid() {
    const user = userEvent.setup();
    renderWithProviders(<AdminPasswordChangeForm />);
    await user.type(current(), "Old-pass1");
    await user.type(next(), "Password123");
    await user.type(confirm(), "Password123");
    await user.click(screen.getByRole("button", { name: d.passwordSubmit }));
  }

  it("puts a DTO 400 about the new password under «Новий пароль» (TASK-1984)", async () => {
    toast.error.mockClear();
    server.use(
      http.post("*/api/auth/password/change", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: "Password must contain a lowercase letter and a digit",
            fieldErrors: [
              { field: "newPassword", constraint: "isCustomerPassword" },
            ],
          },
          { status: 400 },
        ),
      ),
    );
    await submitValid();

    await waitFor(() => expect(next()).toHaveAttribute("aria-invalid", "true"));
    expect(next()).toHaveAccessibleDescription(
      expect.stringContaining(d.passwordWeak),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("puts the service's staff-policy 400 (no fieldErrors) under «Новий пароль»", async () => {
    toast.error.mockClear();
    server.use(
      http.post("*/api/auth/password/change", () =>
        HttpResponse.json(
          { statusCode: 400, message: "Staff password must contain…" },
          { status: 400 },
        ),
      ),
    );
    await submitValid();

    await waitFor(() => expect(next()).toHaveAttribute("aria-invalid", "true"));
    expect(screen.queryByText("Staff password must contain…")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a field-less failure once, in the form's banner", async () => {
    toast.error.mockClear();
    server.use(
      http.post("*/api/auth/password/change", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    await submitValid();

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the note that other sessions end", () => {
    renderWithProviders(<AdminPasswordChangeForm />);

    expect(screen.getByText(d.passwordDescription)).toBeInTheDocument();
  });
});
