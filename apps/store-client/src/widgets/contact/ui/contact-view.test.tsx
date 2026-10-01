import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { ContactView } from "./contact-view";

const contact = {
  id: "1",
  phone: "0 800 55 44 33",
  email: "hi@casestore.ua",
  workingHours: "Пн–Пт 9:00–18:00",
  telegramLink: "https://t.me/casestore",
  viberLink: null,
  instagramLink: null,
  createdAt: "",
  updatedAt: "",
} as SiteContactSettingsEntity;

const d = dict.contact;

describe("ContactView", () => {
  it("shows the real contact channels, a configured messenger and the FAQ link", () => {
    renderWithProviders(<ContactView contact={contact} />);

    expect(screen.getByText(contact.phone!)).toBeInTheDocument();
    expect(screen.getByText(contact.email!)).toBeInTheDocument();
    // Only the configured messenger (Telegram) is rendered as a real link.
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      contact.telegramLink!,
    );
    expect(
      screen.queryByRole("link", { name: "Viber" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.faqCta })).toHaveAttribute(
      "href",
      "/info#faq",
    );
  });

  it("keeps one filled primary — the submit; FAQ outline, topic chip tinted (TASK-865)", () => {
    const { container } = renderWithProviders(
      <ContactView contact={contact} />,
    );

    const filled = container.querySelectorAll(".bg-primary");
    expect(filled).toHaveLength(1);
    expect(filled[0]).toBe(screen.getByRole("button", { name: d.submit }));
    expect(screen.getByRole("link", { name: d.faqCta })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    const selected = screen.getByRole("button", { pressed: true });
    expect(selected).toHaveClass("bg-primary/10", "text-foreground");
  });

  it("shows no bracketed placeholder and no office without an address (TASK-873)", () => {
    const { container } = renderWithProviders(
      <ContactView contact={contact} />,
    );

    expect(container.textContent).not.toMatch(/\[[^\]]*[а-яіїєґa-z][^\]]*\]/i);
    // «Контакти магазину» stores no address yet, so there is no office card.
    expect(
      screen.queryByRole("heading", { name: d.officeHeading }),
    ).not.toBeInTheDocument();
    // Each department writes to the shop's one support email, subject = title.
    for (const dep of d.departments) {
      expect(
        screen.getByRole("link", { name: d.departmentWriteAria(dep.title) }),
      ).toHaveAttribute(
        "href",
        `mailto:${contact.email}?subject=${encodeURIComponent(dep.title)}`,
      );
    }
  });

  it("falls back to the localized defaults when no contact settings exist", () => {
    renderWithProviders(<ContactView contact={null} />);

    expect(screen.getByText(dict.footer.contactPhone)).toBeInTheDocument();
    expect(screen.getByText(d.messengersEmpty)).toBeInTheDocument();
  });

  /** Fill the message form with valid values, accept consent, and submit. */
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
      screen.getByRole("textbox", { name: d.fieldName }),
      "Олександр",
    );
    // The field masks as you type and already shows the `+380` prefix
    // (TASK-407) — type the 9-digit local part, as a shopper would.
    await user.type(
      screen.getByRole("textbox", { name: d.fieldPhone }),
      "501112233",
    );
    await user.type(
      screen.getByRole("textbox", { name: d.fieldEmail }),
      "shopper@example.com",
    );
    await user.type(
      screen.getByRole("textbox", { name: d.fieldMessage }),
      "Питання про доставку",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: d.submit }));
  }

  it("posts the message to /api/contact and shows the confirmation", async () => {
    let received: unknown = null;
    server.use(
      http.post("*/api/contact", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          { data: { id: "contact-1" } },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.sentHeading)).toBeInTheDocument();
    expect(received).toMatchObject({
      name: "Олександр",
      phone: "+380 50 111 2233",
      email: "shopper@example.com",
      message: "Питання про доставку",
      topic: d.topics[0].key,
    });

    // "Send another" resets back to the form.
    await user.click(screen.getByRole("button", { name: d.sentAgain }));
    expect(
      screen.getByRole("heading", { name: d.formHeading }),
    ).toBeInTheDocument();
  });

  it("shows the rate-limit error message on a 429 response", async () => {
    server.use(
      http.post("*/api/contact", () =>
        HttpResponse.json(
          { statusCode: 429, message: "Too Many Requests" },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.rateLimited)).toBeInTheDocument();
    // The form stays visible so the user can retry — no confirmation panel.
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });

  it("tells a sender on the per-email cooldown to wait 10 minutes, not one (TASK-452)", async () => {
    server.use(
      http.post("*/api/contact", () =>
        HttpResponse.json(
          {
            statusCode: 429,
            error: "CONTACT_COOLDOWN",
            message: "A message from this email was received recently.",
          },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.cooldown)).toBeInTheDocument();
    expect(screen.queryByText(d.errors.rateLimited)).not.toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });

  describe("honeypot (TASK-452)", () => {
    const honeypot = (container: HTMLElement) =>
      container.querySelector<HTMLInputElement>('input[name="website"]');

    it("renders a field people cannot see, reach by Tab or have autofilled", () => {
      const { container } = renderWithProviders(
        <ContactView contact={contact} />,
      );

      const input = honeypot(container);
      expect(input).not.toBeNull();
      expect(input).toHaveAttribute("tabindex", "-1");
      expect(input).toHaveAttribute("autocomplete", "off");
      // The opt-outs the password managers actually read: `website` is a real
      // field in their identity records, and `autocomplete="off"` alone does
      // not stop them (nor Chrome's profile autofill).
      expect(input).toHaveAttribute("data-1p-ignore");
      expect(input).toHaveAttribute("data-lpignore", "true");
      expect(input).toHaveAttribute("data-bwignore");
      expect(input).toHaveAttribute("data-form-type", "other");
      // Out of the accessibility tree AND out of reach of focus/pointer:
      // `aria-hidden` alone leaves the input focusable, `inert` is what closes
      // that. (jsdom does not implement `inert`, so the role query below is
      // what `aria-hidden` buys us here.)
      const wrapper = input!.closest("div");
      expect(wrapper).toHaveAttribute("inert");
      expect(wrapper).toHaveAttribute("aria-hidden", "true");
      expect(
        screen.queryByRole("textbox", { name: d.honeypotLabel }),
      ).not.toBeInTheDocument();
    });

    it("still submits when the trap holds an over-long value", async () => {
      // Regression: a blocking `max()` on a field no error is rendered for made
      // the submit button do nothing and threw focus into the hidden input.
      let received: Record<string, unknown> | null = null;
      server.use(
        http.post("*/api/contact", async ({ request }) => {
          received = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            { data: { id: "contact-1" } },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <ContactView contact={contact} />,
      );

      fireEvent.input(honeypot(container)!, {
        target: { value: `https://spam.example/${"x".repeat(400)}` },
      });
      await fillAndSubmit(user);

      await screen.findByText(d.sentHeading);
      // Clamped to the DTO's bound rather than refused by the client.
      expect((received as unknown as { website: string }).website).toHaveLength(
        255,
      );
    });

    it("sends no honeypot value for a person", async () => {
      let received: Record<string, unknown> | null = null;
      server.use(
        http.post("*/api/contact", async ({ request }) => {
          received = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            { data: { id: "contact-1" } },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      renderWithProviders(<ContactView contact={contact} />);

      await fillAndSubmit(user);

      await screen.findByText(d.sentHeading);
      expect(received).not.toHaveProperty("website");
    });

    it("passes a filled honeypot through, so the API can discard the message", async () => {
      let received: Record<string, unknown> | null = null;
      server.use(
        http.post("*/api/contact", async ({ request }) => {
          received = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            { data: { id: "contact-1" } },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <ContactView contact={contact} />,
      );

      // What a form-filling bot does: type into every input it finds.
      fireEvent.input(honeypot(container)!, {
        target: { value: "https://spam.example" },
      });
      await fillAndSubmit(user);

      await screen.findByText(d.sentHeading);
      expect(received).toMatchObject({ website: "https://spam.example" });
    });
  });

  it("blocks submit and surfaces validation errors when required fields are empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await user.click(screen.getByRole("button", { name: d.submit }));

    expect(await screen.findByText(d.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(d.errors.consentRequired)).toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });
});
