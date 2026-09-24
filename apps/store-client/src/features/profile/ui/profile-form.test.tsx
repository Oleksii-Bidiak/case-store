import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeUser } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { ProfileForm } from "./profile-form";

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
