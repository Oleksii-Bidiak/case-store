import { http, HttpResponse } from "msw";
import {
  fireEvent,
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

  // The absolute-URL case above was never the dangerous one — a leading-slash
  // check already caught it. `//evil.com` starts with "/" and sailed through,
  // and the browser reads it as protocol-relative.
  it("ignores a protocol-relative ?redirect= and falls back to '/'", async () => {
    mockRedirectParam = "//evil.com";
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole("button", { name: dict.auth.register.submit }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockPush).not.toHaveBeenCalledWith("//evil.com");
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

  // ── TASK-749: the registration honeypot ────────────────────────────────────
  describe("honeypot", () => {
    const trap = (container: HTMLElement) =>
      container.querySelector<HTMLInputElement>('input[name="hpCheck"]');

    /** Capture the register request body. */
    function captureRegister(): { current: Record<string, unknown> | null } {
      const captured: { current: Record<string, unknown> | null } = {
        current: null,
      };
      server.use(
        http.post("*/api/auth/register", async ({ request }) => {
          captured.current = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            { data: { accessToken: "test.access.token" } },
            { status: 201 },
          );
        }),
      );
      return captured;
    }

    it("renders a field people cannot see, reach by Tab or have autofilled", () => {
      const { container } = renderWithProviders(<RegisterForm />);

      const input = trap(container);
      expect(input).not.toBeNull();
      expect(input).toHaveAttribute("tabindex", "-1");
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("data-1p-ignore");
      expect(input).toHaveAttribute("data-lpignore", "true");
      expect(input).toHaveAttribute("data-bwignore");
      expect(input!.closest("div")).toHaveAttribute("inert");
      expect(input!.closest("div")).toHaveAttribute("aria-hidden", "true");
      // Not the contact form's `website`: that name is an autofill slot.
      expect(container.querySelector('input[name="website"]')).toBeNull();
    });

    it("sends no honeypot key for a person", async () => {
      const captured = captureRegister();
      const user = userEvent.setup();
      renderWithProviders(<RegisterForm />);

      await fillValidForm(user);
      await user.click(
        screen.getByRole("button", { name: dict.auth.register.submit }),
      );

      await waitFor(() => expect(captured.current).not.toBeNull());
      expect(captured.current).not.toHaveProperty("hpCheck");
    });

    it("passes a filled trap through, clamped, so the API can refuse quietly", async () => {
      const captured = captureRegister();
      const user = userEvent.setup();
      const { container } = renderWithProviders(<RegisterForm />);

      await fillValidForm(user);
      // A bot writes into the DOM directly — `inert` keeps people (and
      // user-event) out, so the value is set the way a script would set it.
      fireEvent.change(trap(container)!, {
        target: { value: "x".repeat(300) },
      });
      await user.click(
        screen.getByRole("button", { name: dict.auth.register.submit }),
      );

      await waitFor(() => expect(captured.current).not.toBeNull());
      expect(captured.current?.hpCheck).toBe("x".repeat(255));
    });
  });

  // TASK-871 — layout and consent.
  it("stacks first and last name in one column below sm", () => {
    renderWithProviders(<RegisterForm />);

    const row = screen
      .getByLabelText(dict.auth.register.firstName)
      .closest(".grid");
    expect(row).toHaveClass("grid", "gap-4", "sm:grid-cols-2");
    // No unconditional two-column grid: that squeezed both inputs on a 390.
    expect(row).not.toHaveClass("grid-cols-2");
    expect(row).toContainElement(
      screen.getByLabelText(dict.auth.register.lastName),
    );
  });

  describe("consent", () => {
    const r = dict.auth.register;

    it("links the offer and the privacy policy, each in a new tab", () => {
      renderWithProviders(<RegisterForm />);

      const offer = screen.getByRole("link", {
        name: new RegExp(r.consentOfferLink),
      });
      const privacy = screen.getByRole("link", {
        name: new RegExp(r.consentPrivacyLink),
      });
      expect(offer).toHaveAttribute("href", "/legal/offer");
      expect(privacy).toHaveAttribute("href", "/legal/privacy-policy");
      for (const link of [offer, privacy]) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        // Announces the new tab instead of surprising a screen-reader user.
        expect(link).toHaveTextContent(r.consentNewTab);
      }
    });

    it("names the checkbox by its label and describes it with the documents", () => {
      renderWithProviders(<RegisterForm />);

      const box = screen.getByRole("checkbox", { name: r.consentPrefix });
      expect(box).toHaveAccessibleDescription(
        new RegExp(`${r.consentOfferLink}.*${r.consentPrivacyLink}`),
      );
    });

    it("keeps the document links outside the checkbox label", () => {
      renderWithProviders(<RegisterForm />);

      // A link inside a <label> is a second click target on one control: a
      // mis-tap would tick the box instead of opening the document.
      for (const name of [r.consentOfferLink, r.consentPrivacyLink]) {
        expect(
          screen.getByRole("link", { name: new RegExp(name) }).closest("label"),
        ).toBeNull();
      }
    });

    it("still blocks the submit until the box is ticked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<RegisterForm />);

      await user.click(screen.getByRole("button", { name: r.submit }));

      const box = screen.getByRole("checkbox");
      expect(await screen.findByText(r.validationTerms)).toBeInTheDocument();
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
