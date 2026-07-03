import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { InfoView } from "./info-view";

const contact = {
  id: "1",
  phone: "0 800 111 22 33",
  email: "hi@mobilestore.ua",
  workingHours: "Пн–Пт 9:00–18:00",
  telegramLink: "https://t.me/mobilestore",
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
});
