import { http, HttpResponse, delay } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SiteContactSettingsView } from "./site-contact-settings-view";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

function siteContactResponse() {
  return {
    data: {
      id: SINGLETON_ID,
      email: "test@store.ua",
      phone: "+380 50 000 0000",
      workingHours: "Пн–Нд 9–20",
      viberLink: null,
      telegramLink: null,
      instagramLink: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("SiteContactSettingsView (TASK-154)", () => {
  it("populates the form inputs from the fetched settings", async () => {
    server.use(
      http.get("*/api/site-contact", () =>
        HttpResponse.json(siteContactResponse()),
      ),
    );

    renderWithProviders(<SiteContactSettingsView />);

    expect(
      await screen.findByDisplayValue("test@store.ua"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("+380 50 000 0000")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.siteContactForm.submit }),
    ).toBeInTheDocument();
  });

  it("shows the loading state while the query is pending", () => {
    // Keep the request pending so the view stays in its loading branch.
    server.use(
      http.get("*/api/site-contact", async () => {
        await delay("infinite");
        return HttpResponse.json(siteContactResponse());
      }),
    );

    renderWithProviders(<SiteContactSettingsView />);

    // The submit button is absent until data arrives; the heading is always shown.
    expect(screen.getByText(dict.siteContact.heading)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.siteContactForm.submit }),
    ).not.toBeInTheDocument();
  });
});

describe("SiteContactSettingsView — by mockup Н1 (TASK-1053)", () => {
  it("is titled «Контакти» and says where the contacts show up", () => {
    server.use(
      http.get("*/api/site-contact", async () => {
        await delay("infinite");
        return HttpResponse.json(siteContactResponse());
      }),
    );

    renderWithProviders(<SiteContactSettingsView />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Контакти" }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.siteContact.subheading)).toBeInTheDocument();
  });

  it("offers «Повторити» when the settings fail to load, and refetches", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/site-contact", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json(siteContactResponse());
      }),
    );

    renderWithProviders(<SiteContactSettingsView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(dict.siteContact.loadError);
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.retry }),
    );

    expect(
      await screen.findByDisplayValue("test@store.ua"),
    ).toBeInTheDocument();
  });
});
