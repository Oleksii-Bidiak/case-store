import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { InfoView } from "./info-view";

const contact = {
  id: "1",
  phone: "0 800 111 22 33",
  email: "hi@casestore.ua",
  workingHours: "Пн–Пт 9:00–18:00",
  telegramLink: "https://t.me/casestore",
  viberLink: null,
  instagramLink: null,
  createdAt: "",
  updatedAt: "",
} as SiteContactSettingsEntity;

const d = dict.info;

describe("InfoView", () => {
  it("renders the delivery section by default", () => {
    renderWithProviders(<InfoView contact={contact} />);

    expect(
      screen.getByRole("heading", { level: 2, name: d.deliveryHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText("Нова Пошта")).toBeInTheDocument();
  });

  it("switches to the FAQ section and expands a question", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InfoView contact={contact} />);

    await user.click(screen.getByRole("button", { name: d.nav.faq }));

    const question = screen.getByRole("button", {
      name: /Скільки коштує доставка/,
    });
    expect(question).toBeInTheDocument();

    await user.click(question);
    expect(
      screen.getByText(/безкоштовно при замовленні від 1 000/),
    ).toBeInTheDocument();
  });

  it("shows the real contact details + form on the contacts section", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InfoView contact={contact} />);

    await user.click(screen.getByRole("button", { name: d.nav.contacts }));

    expect(screen.getByText(contact.phone!)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: d.formHeading }),
    ).toBeInTheDocument();
    // Only the configured messenger link (Telegram) is shown.
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      contact.telegramLink!,
    );
  });

  describe("contact form anti-spam (TASK-452)", () => {
    async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: d.nav.contacts }));
      await user.type(
        screen.getByRole("textbox", { name: d.formName }),
        "Олександр",
      );
      await user.type(
        screen.getByRole("textbox", { name: d.formPhone }),
        "+380501112233",
      );
      await user.type(
        screen.getByRole("textbox", { name: d.formEmail }),
        "shopper@example.com",
      );
      await user.type(
        screen.getByRole("textbox", { name: d.formMessage }),
        "Питання про доставку",
      );
    }

    it("carries the same hidden honeypot as the /contact form", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<InfoView contact={contact} />);

      await user.click(screen.getByRole("button", { name: d.nav.contacts }));

      const input = container.querySelector('input[name="website"]');
      expect(input).toHaveAttribute("tabindex", "-1");
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("data-1p-ignore");
      expect(input).toHaveAttribute("data-lpignore", "true");
      expect(input!.closest("div")).toHaveAttribute("inert");
      expect(input!.closest("div")).toHaveAttribute("aria-hidden", "true");
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
      renderWithProviders(<InfoView contact={contact} />);

      await openAndFill(user);
      await user.click(screen.getByRole("button", { name: d.formSubmit }));

      expect(await screen.findByText(d.formSent)).toBeInTheDocument();
      expect(received).not.toHaveProperty("website");
    });

    it("tells a sender on the per-email cooldown to wait 10 minutes", async () => {
      server.use(
        http.post("*/api/contact", () =>
          HttpResponse.json(
            { statusCode: 429, error: "CONTACT_COOLDOWN", message: "recent" },
            { status: 429 },
          ),
        ),
      );

      const user = userEvent.setup();
      renderWithProviders(<InfoView contact={contact} />);

      await openAndFill(user);
      await user.click(screen.getByRole("button", { name: d.formSubmit }));

      expect(
        await screen.findByText(dict.contact.errors.cooldown),
      ).toBeInTheDocument();
      expect(screen.queryByText(d.formError)).not.toBeInTheDocument();
    });
  });
});
