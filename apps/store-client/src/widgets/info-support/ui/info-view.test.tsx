import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
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

  it("shows the real contact details and a link card to /contact, not a form (TASK-866)", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<InfoView contact={contact} />);

    await user.click(screen.getByRole("button", { name: d.nav.contacts }));

    expect(screen.getByText(contact.phone!)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: d.formHeading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: d.contactsFormCardCta }),
    ).toHaveAttribute("href", "/contact");
    // /contact is the single contact form (owner decision 7.8) — no second
    // copy of it here, not even hidden.
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // Only the configured messenger link (Telegram) is shown.
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      contact.telegramLink!,
    );
  });

  describe("every section is in the HTML (TASK-866)", () => {
    it("renders all five panels, showing only the active one", () => {
      const { container } = renderWithProviders(<InfoView contact={contact} />);

      for (const key of [
        "delivery",
        "warranty",
        "faq",
        "about",
        "contacts",
      ] as const) {
        const panel = container.querySelector(`#info-panel-${key}`);
        expect(panel).not.toBeNull();
        if (key === "delivery") {
          expect(panel).not.toHaveAttribute("hidden");
        } else {
          expect(panel).toHaveAttribute("hidden");
        }
        expect(
          screen.getByRole("button", { name: d.nav[key] }),
        ).toHaveAttribute("aria-controls", `info-panel-${key}`);
      }
    });

    it("puts every FAQ question and answer in the DOM before the FAQ tab is opened", () => {
      const faqs = [
        { q: "Питання один?", a: "Відповідь один." },
        { q: "Питання два?", a: "Відповідь два." },
      ];
      const { container } = renderWithProviders(
        <InfoView contact={contact} faqs={faqs} />,
      );

      const panel = container.querySelector("#info-panel-faq")!;
      for (const faq of faqs) {
        expect(panel).toHaveTextContent(faq.q);
        expect(panel).toHaveTextContent(faq.a);
      }
      // Hidden from users and assistive tech until the tab is chosen.
      expect(
        screen.queryByRole("button", { name: "Питання один?" }),
      ).not.toBeInTheDocument();
    });

    it("keeps a collapsed answer hidden and wires it to its question", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <InfoView
          contact={contact}
          faqs={[{ q: "Питання один?", a: "Відповідь один." }]}
        />,
      );

      await user.click(screen.getByRole("button", { name: d.nav.faq }));
      const question = screen.getByRole("button", { name: "Питання один?" });
      const answer = screen.getByText("Відповідь один.");

      expect(question).toHaveAttribute("aria-expanded", "false");
      expect(question).toHaveAttribute("aria-controls", answer.id);
      expect(answer).not.toBeVisible();

      await user.click(question);
      expect(question).toHaveAttribute("aria-expanded", "true");
      expect(answer).toBeVisible();
    });
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
});
