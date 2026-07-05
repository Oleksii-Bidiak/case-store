import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
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

  /** Fill the message form with valid values, accept consent, and submit. */
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
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
      phone: "+380501112233",
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

  it("blocks submit and surfaces validation errors when required fields are empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactView contact={contact} />);

    await user.click(screen.getByRole("button", { name: d.submit }));

    expect(await screen.findByText(d.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(d.errors.consentRequired)).toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });
});
