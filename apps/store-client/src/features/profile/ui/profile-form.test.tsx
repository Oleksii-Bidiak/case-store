import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeUser } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { ProfileForm } from "./profile-form";

const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

beforeEach(() => toastError.mockClear());

/**
 * TASK-794: `firstName`/`lastName` carried a bare `.max(100)` with no error
 * rendered and no `maxLength` on the input. An over-long name (a paste, an
 * autofill) stopped «Зберегти зміни» with nothing on screen to say why — the
 * "silent button". Each field must now cap its input AND name the limit.
 */
describe("ProfileForm — name limits are visible (TASK-794)", () => {
  const cases = [
    {
      field: "firstName",
      label: dict.account.firstName,
      message: dict.account.firstNameMax,
    },
    {
      field: "lastName",
      label: dict.account.lastName,
      message: dict.account.lastNameMax,
    },
  ] as const;

  it.each(cases)("caps $field at 100 characters", ({ label }) => {
    renderWithProviders(<ProfileForm user={makeUser().data} />);

    expect(screen.getByLabelText(label)).toHaveAttribute("maxLength", "100");
  });

  it.each(cases)(
    "names the limit instead of silently refusing an over-long $field",
    async ({ label, message }) => {
      const user = userEvent.setup();
      let saved = false;
      server.use(
        http.put("*/api/users/me", () => {
          saved = true;
          return HttpResponse.json(makeUser());
        }),
      );

      renderWithProviders(<ProfileForm user={makeUser().data} />);

      // `maxLength` stops typing, not a programmatic value — set it directly,
      // the way autofill or a script would.
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value: "а".repeat(101) } });
      await user.click(screen.getByRole("button", { name: dict.account.save }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(saved).toBe(false);
    },
  );
});

/**
 * TASK-799: the phone is checked on DIGITS with the storefront's one phone rule
 * (`isValidUAPhone`), and emptying the field is sent as an explicit `null`.
 */
describe("ProfileForm — phone (TASK-799)", () => {
  function captureSave() {
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/users/me", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeUser());
      }),
    );
    return bodies;
  }

  it.each(["----------", "+1 234 567 8901", "(((((((((("])(
    "refuses %p with a visible message and sends nothing",
    async (phone) => {
      const user = userEvent.setup();
      const bodies = captureSave();

      renderWithProviders(<ProfileForm user={makeUser().data} />);

      const input = screen.getByLabelText(dict.account.phone);
      fireEvent.change(input, { target: { value: phone } });
      await user.click(screen.getByRole("button", { name: dict.account.save }));

      expect(
        await screen.findByText(dict.account.phoneInvalid),
      ).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(bodies).toHaveLength(0);
    },
  );

  it("saves a Ukrainian number typed with separators", async () => {
    const user = userEvent.setup();
    const bodies = captureSave();

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    fireEvent.change(screen.getByLabelText(dict.account.phone), {
      target: { value: "050 111 2233" },
    });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ phone: "050 111 2233" });
  });

  it("sends an emptied phone as an explicit null (removal)", async () => {
    const user = userEvent.setup();
    const bodies = captureSave();

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    fireEvent.change(screen.getByLabelText(dict.account.phone), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ phone: null });
  });
});

/**
 * TASK-1984 / SF-ACC-36: `050 111 2233 ccc` passed the profile schema (the
 * letters were stripped before judging) while the API refused it, and the 400
 * came back as a generic toast. Now the field is the masked `PhoneInput` (UA,
 * like `@IsUaPhone`), capped at the DTO's 30, and a 400 lands under its field.
 */
describe("ProfileForm — field standard (TASK-1984)", () => {
  function respondWith(status: number, body: unknown) {
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/users/me", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(body as Record<string, unknown>, { status });
      }),
    );
    return bodies;
  }

  it("draws the UA mask and caps the phone at the DTO's 30 characters", () => {
    renderWithProviders(
      <ProfileForm user={{ ...makeUser().data, phone: "380501112233" }} />,
    );

    const input = screen.getByLabelText(dict.account.phone);
    expect(input).toHaveAttribute("maxLength", "30");
    expect(input).toHaveValue("+380 50 111 2233");
  });

  it("never sends the letters of a pasted '050 111 2233 ccc'", async () => {
    const user = userEvent.setup();
    const bodies = respondWith(200, makeUser());

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    fireEvent.change(screen.getByLabelText(dict.account.phone), {
      target: { value: "050 111 2233 ccc" },
    });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { phone: string }).phone).not.toMatch(/[a-z]/i);
  });

  it("puts a server 400 on the phone under the phone field, with no toast", async () => {
    const user = userEvent.setup();
    respondWith(400, {
      statusCode: 400,
      message: ["phone must be a valid Ukrainian phone number"],
      fieldErrors: [{ field: "phone", constraint: "isUaPhone" }],
    });

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    const input = screen.getByLabelText(dict.account.phone);
    fireEvent.change(input, { target: { value: "050 111 2233" } });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() =>
      expect(input).toHaveAccessibleDescription(dict.forms.phoneInvalid),
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("puts a server 400 on a name under that name", async () => {
    const user = userEvent.setup();
    respondWith(400, {
      statusCode: 400,
      message: ["First name must be at most 100 characters"],
      fieldErrors: [{ field: "firstName", constraint: "maxLength" }],
    });

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    const input = screen.getByLabelText(dict.account.firstName);
    fireEvent.change(input, { target: { value: "Олена" } });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() =>
      expect(input).toHaveAccessibleDescription(dict.account.firstNameMax),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the toast for an error no field can hold", async () => {
    const user = userEvent.setup();
    respondWith(500, { statusCode: 500 });

    renderWithProviders(<ProfileForm user={makeUser().data} />);

    fireEvent.change(screen.getByLabelText(dict.account.firstName), {
      target: { value: "Олена" },
    });
    await user.click(screen.getByRole("button", { name: dict.account.save }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(dict.account.updateError),
    );
  });
});
