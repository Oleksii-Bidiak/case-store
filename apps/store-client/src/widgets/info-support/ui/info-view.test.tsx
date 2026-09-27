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

  describe("blocks from CMS pages (TASK-560)", () => {
    const page = (heading: string) => ({
      heading,
      intro: `${heading} — лід`,
      html: `<p>${heading} із CMS</p>`,
    });

    it("renders each block from its page instead of the static cards", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <InfoView
          contact={contact}
          sections={{
            delivery: page("Доставка власника"),
            payment: page("Оплата власника"),
            warranty: page("Гарантія власника"),
            aboutStats: page("Ми в цифрах"),
          }}
        />,
      );

      expect(
        screen.getByRole("heading", { level: 2, name: "Доставка власника" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Доставка власника із CMS")).toBeInTheDocument();
      expect(screen.getByText("Оплата власника — лід")).toBeInTheDocument();
      // The static fallback cards are gone.
      expect(screen.queryByText("Нова Пошта")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: d.nav.warranty }));
      expect(screen.getByText("Гарантія власника із CMS")).toBeInTheDocument();
      expect(screen.queryByText("місяці гарантії")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: d.nav.about }));
      expect(
        screen.getByRole("heading", { level: 3, name: "Ми в цифрах" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("років на ринку")).not.toBeInTheDocument();
    });

    it("hides a block whose page is missing rather than showing the old text", () => {
      renderWithProviders(
        <InfoView
          contact={contact}
          sections={{
            delivery: "missing",
            payment: page("Оплата власника"),
            warranty: "unavailable",
            aboutStats: "unavailable",
          }}
        />,
      );

      expect(
        screen.queryByRole("heading", { level: 2, name: d.deliveryHeading }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Нова Пошта")).not.toBeInTheDocument();
      expect(screen.getByText("Оплата власника із CMS")).toBeInTheDocument();
    });

    it("lists the other published help pages as links", () => {
      renderWithProviders(
        <InfoView
          contact={contact}
          pages={[{ title: "Як повернути товар", href: "/info/returns-howto" }]}
        />,
      );

      const nav = screen.getByRole("navigation", { name: d.pagesHeading });
      expect(nav).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Як повернути товар" }),
      ).toHaveAttribute("href", "/info/returns-howto");
    });

    it("renders no pages list when there are none", () => {
      renderWithProviders(<InfoView contact={contact} />);

      expect(
        screen.queryByRole("navigation", { name: d.pagesHeading }),
      ).not.toBeInTheDocument();
    });
  });

  describe("add-on services (TASK-561)", () => {
    it("lists the real add-ons with a starting price, not invented ones", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <InfoView
          contact={contact}
          services={[
            {
              id: "svc-1",
              name: "Гарантійний сертифікат (24 міс.)",
              description: "Продовжена гарантія",
              price: "499.00",
            },
          ]}
        />,
      );

      await user.click(screen.getByRole("button", { name: d.nav.warranty }));

      expect(
        screen.getByRole("heading", { level: 3, name: d.servicesHeading }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Гарантійний сертифікат (24 міс.)"),
      ).toBeInTheDocument();
      expect(screen.getByText(/від 499\s₴/)).toBeInTheDocument();
      // The three services the page used to advertise are gone.
      expect(screen.queryByText("Screen Repair")).not.toBeInTheDocument();
      expect(screen.queryByText("Save Plus")).not.toBeInTheDocument();
    });

    it("renders no services card when nothing is offered", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InfoView contact={contact} />);

      await user.click(screen.getByRole("button", { name: d.nav.warranty }));

      expect(
        screen.queryByRole("heading", { level: 3, name: d.servicesHeading }),
      ).not.toBeInTheDocument();
    });
  });

  describe("contact form anti-spam (TASK-452)", () => {
    async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: d.nav.contacts }));
      await user.type(
        screen.getByRole("textbox", { name: d.formName }),
        "Олександр",
      );
      // TASK-744 masks the field as `+380 NN NNN NNNN` with the prefix already
      // shown, so a shopper types the nine national digits (TASK-1450).
      await user.type(
        screen.getByRole("textbox", { name: d.formPhone }),
        "501112233",
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
