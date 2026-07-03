import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { ContactView } from "./contact-view";

const contact = {
  id: "1",
  phone: "0 800 55 44 33",
  email: "hi@mobilestore.ua",
  workingHours: "Пн–Пт 9:00–18:00",
  telegramLink: "https://t.me/mobilestore",
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

  it("falls back to the localized defaults when no contact settings exist", () => {
    renderWithProviders(<ContactView contact={null} />);

    expect(screen.getByText(dict.footer.contactPhone)).toBeInTheDocument();
    expect(screen.getByText(d.messengersEmpty)).toBeInTheDocument();
  });

  it("submits the message form stub and shows the confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await user.type(
      screen.getByRole("textbox", { name: d.fieldName }),
      "Олександр",
    );
    await user.type(
      screen.getByRole("textbox", { name: d.fieldPhone }),
      "+380501112233",
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

    expect(screen.getByText(d.sentHeading)).toBeInTheDocument();
    // "Send another" resets back to the form.
    await user.click(screen.getByRole("button", { name: d.sentAgain }));
    expect(
      screen.getByRole("heading", { name: d.formHeading }),
    ).toBeInTheDocument();
  });
});
